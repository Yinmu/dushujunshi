
  // ---------- 输入页 ----------
  function setupChips(container, onPick) {
    container.addEventListener('click', (e) => {
      const chip = e.target.closest('.chip');
      if (!chip || chip.disabled) return;
      pickChip(container, chip.dataset.value);
      if (onPick) onPick(chip.dataset.value);
    });
  }

  function pickChip(container, value) {
    container.dataset.value = value;
    container.querySelectorAll('.chip').forEach((c) => c.classList.toggle('active', c.dataset.value === value));
  }

  function updateCount() {
    const ta = $('input-text');
    const chars = Array.from(ta.value);
    if (chars.length > MAX_INPUT) ta.value = chars.slice(0, MAX_INPUT).join('');
    const n = Math.min(chars.length, MAX_INPUT);
    $('input-count').textContent = n;
    $('input-count').parentNode.classList.toggle('full', n >= MAX_INPUT);
  }

  function resetInput() {
    $('input-text').value = '';
    updateCount();
    pickChip($('relation-chips'), '同事');
    pickChip($('goal-chips'), '我要真回过去');
    showError('input-error', '');
  }

  async function onGenerate(e) {
    e.preventDefault();
    showError('input-error', '');
    const text = $('input-text').value.trim();
    if (!text) { showError('input-error', '先把对方的原话贴进来。'); return; }
    const relation = $('relation-chips').dataset.value;
    const goal = $('goal-chips').dataset.value;
    if (!getConfig().key) {
      $('settings').open = true;
      showError('input-error', '还没填 API key：在上面的「API 设置」里填一下，或者点「看看示例」先体验。');
      return;
    }
    const btn = $('btn-generate');
    btn.disabled = true;
    btn.textContent = '三位军师商量中…';
    try {
      const content = await callChat([
        { role: 'system', content: REPLY_SYSTEM_PROMPT },
        { role: 'user', content: buildReplyUserPrompt(text, relation, goal) }
      ]);
      let replies;
      try { replies = normalizeReplies(parseJSON(content)); } catch (err) {
        throw new Error('军师们没按格式交卷（返回的不是有效 JSON），再点一次试试。');
      }
      state.exampleIndex = null;
      state.input = { text, relation, goal };
      state.replies = replies;
      state.feedback = {};
      renderResult();
    } catch (err) {
      showError('input-error', err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = '召唤三位军师';
    }
  }

  function normalizeReplies(obj) {
    const list = obj && Array.isArray(obj.replies) ? obj.replies : [];
    const names = ['阴阳参谋', '逻辑军师', '稳场军师'];
    const out = list.slice(0, 3).map((r, i) => ({
      strategist: String(r.strategist || names[i]),
      strategy: String(r.strategy || ''),
      reply: String(r.reply || ''),
      consequence: String(r.consequence || '')
    })).filter((r) => r.reply);
    if (out.length < 3) throw new Error('not enough replies');
    return out;
  }

  function startExample(index) {
    const ex = EXAMPLES[index];
    state.exampleIndex = index;
    state.input = Object.assign({}, ex.input);
    state.replies = ex.replies;
    state.feedback = {};
    renderResult();
  }
