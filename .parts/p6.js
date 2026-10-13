
  function renderChat() {
    const s = state.sim;
    const chat = $('chat');
    chat.textContent = '';
    const exTag = isExample() ? '（示例内容，非 AI 生成）' : '（AI 生成）';
    s.turns.forEach((t) => {
      chat.appendChild(el('div', { class: 'bubble opp' }, [
        el('span', { class: 'who', text: s.persona.label + exTag }), document.createTextNode(t.opponent)
      ]));
      if (t.user !== null) {
        chat.appendChild(el('div', { class: 'bubble me' }, [
          el('span', { class: 'who', text: isExample() ? '你（示例内容，非 AI 生成）' : '你' }), document.createTextNode(t.user)
        ]));
      }
    });
    if (s.busy) chat.appendChild(el('div', { class: 'bubble opp typing', text: '对方正在输入…' }));
    chat.scrollTop = chat.scrollHeight;

    const waiting = s.turns.length && s.turns[s.turns.length - 1].user === null;
    const lastFailed = !s.busy && !waiting && !s.ended;
    $('sim-round').textContent = `第 ${Math.max(s.turns.length, 1)} / ${SIM_MAX_ROUNDS} 回合`;
    $('btn-sim-send').disabled = s.busy || s.ended || (!waiting && !lastFailed);
    $('btn-sim-send').textContent = lastFailed ? '重试' : '发送';
    $('btn-sim-end').disabled = s.busy || s.ended;
  }

  async function onSimSend() {
    const s = state.sim;
    if (!s || s.busy || s.ended) return;
    const last = s.turns[s.turns.length - 1];
    if (!last || last.user !== null) { await nextOpponent(); return; } // 上次对手台词没拿到，重试
    const text = Array.from($('sim-input').value.trim()).slice(0, MAX_INPUT).join('');
    if (!text) { showError('sim-error', '先写一句你的回复。'); return; }
    showError('sim-error', '');
    last.user = text;
    $('sim-input').value = '';
    const scriptLen = isExample() ? EXAMPLES[state.exampleIndex].sim.script.length : SIM_MAX_ROUNDS;
    if (s.turns.length >= Math.min(SIM_MAX_ROUNDS, scriptLen)) {
      renderChat();
      toast('回合用完，开始复盘');
      await endSim();
      return;
    }
    await nextOpponent();
  }

  // ---------- 复盘 ----------
  async function endSim() {
    const s = state.sim;
    if (!s || s.busy || s.ended) return;
    if (isExample()) {
      // 示例复盘基于完整脚本：提前结束时把剩余脚本补齐展示
      const script = EXAMPLES[state.exampleIndex].sim.script;
      s.turns = script.map((t) => ({ opponent: t.opponent, user: t.user }));
      s.ended = true;
      $('sim-input').value = '';
      renderChat();
      renderReview(EXAMPLES[state.exampleIndex].review);
      return;
    }
    const done = s.turns.filter((t) => t.user !== null);
    if (!done.length) { showError('sim-error', '你还一句都没回呢，至少回一轮才能复盘。'); return; }
    s.ended = true;
    s.busy = true;
    renderChat();
    $('btn-sim-end').textContent = '军师复盘中…';
    try {
      const content = await callChat([
        { role: 'system', content: REVIEW_SYSTEM_PROMPT },
        { role: 'user', content: buildReviewUserPrompt(s.persona, s.target, done) }
      ]);
      let review;
      try { review = parseJSON(content); } catch (err) { throw new Error('复盘没按格式返回，点「结束并复盘」再试一次。'); }
      renderReview(review);
    } catch (err) {
      s.ended = false;
      showError('sim-error', err.message);
    } finally {
      s.busy = false;
      $('btn-sim-end').textContent = '结束并复盘';
      if (state.sim === s) renderChat();
    }
  }

  function reviewItem(title, children) {
    return el('div', { class: 'review-item' }, [el('h4', { text: title })].concat(children));
  }

  function roundLabel(r) { return r ? `第 ${r} 轮` : ''; }

  function renderReview(rv) {
    const h = rv.highlight || {};
    const o = rv.offtrack || {};
    const c = rv.compress || {};
    const body = $('review-body');
    body.textContent = '';
    if (isExample()) body.appendChild(el('div', { class: 'notice', text: '示例内容，非 AI 生成。' }));
    body.appendChild(reviewItem('✨ 亮点 ' + roundLabel(h.round), [
      el('p', { text: h.quote ? `「${h.quote}」` : '' }), el('p', { class: 'tip', text: h.why || '' })
    ]));
    body.appendChild(reviewItem('🧭 跑题 ' + roundLabel(o.round), [el('p', { text: o.detail || '（这局没明显跑题）' })]));
    body.appendChild(reviewItem('✂️ 可以压缩 ' + roundLabel(c.round), [
      el('p', { class: 'before', text: c.original || '' }), el('p', { class: 'after', text: '→ ' + (c.better || '') })
    ]));
    body.appendChild(el('p', { class: 'tip', text: '演练基于有限描述，不代表真实对方的反应。' }));
    $('review-badge').textContent = isExample() ? '示例内容，非 AI 生成' : 'AI 生成';
    $('review-badge').className = isExample() ? 'badge example' : 'badge';
    $('sim-review').hidden = false;
    $('sim-review').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
