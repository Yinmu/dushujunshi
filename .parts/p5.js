
  // ---------- 模拟器 ----------
  // sim.turns: [{ opponent, user }]，user 为 null 表示这一轮等你回。
  function findById(list, id) { return list.find((x) => x.id === id); }

  function openSimSetup() {
    syncExampleMarks();
    const ex = isExample() ? EXAMPLES[state.exampleIndex] : null;
    const tBox = $('target-chips');
    const pBox = $('persona-chips');
    tBox.textContent = '';
    pBox.textContent = '';
    SIM_TARGETS.forEach((t) => tBox.appendChild(el('button', { type: 'button', class: 'chip', 'data-value': t.id }, [
      document.createTextNode(t.label), el('small', { text: t.hint })
    ])));
    SIM_PERSONAS.forEach((p) => pBox.appendChild(el('button', { type: 'button', class: 'chip', 'data-value': p.id, text: p.label })));
    tBox.dataset.value = '';
    if (ex) {
      // 示例模式：目标和对手由示例脚本决定，其他选项锁住
      pickChip(tBox, ex.sim.targetId);
      pickChip(pBox, ex.sim.personaId);
      document.querySelectorAll('#target-chips .chip, #persona-chips .chip').forEach((c) => {
        c.disabled = !c.classList.contains('active');
      });
    } else {
      pickChip(pBox, RELATION_TO_PERSONA[state.input && state.input.relation] || 'blame');
    }
    state.sim = null;
    showError('sim-setup-error', '');
    $('sim-setup').hidden = false;
    $('sim-play').hidden = true;
    $('sim-review').hidden = true;
    showView('sim');
  }

  async function startSim() {
    const targetId = $('target-chips').dataset.value;
    const personaId = $('persona-chips').dataset.value;
    if (!targetId) { showError('sim-setup-error', '先选一个这局要练的目标。'); return; }
    if (!isExample() && !getConfig().key) {
      showError('sim-setup-error', '模拟器需要 API key：在页面顶部「API 设置」里填写，或回首页点「看看示例」。');
      return;
    }
    showError('sim-setup-error', '');
    state.sim = { target: findById(SIM_TARGETS, targetId), persona: findById(SIM_PERSONAS, personaId), turns: [], busy: false, ended: false };
    $('sim-setup').hidden = true;
    $('sim-play').hidden = false;
    $('sim-title').textContent = `对手：${state.sim.persona.label} · 目标：${state.sim.target.label}`;
    $('sim-input').readOnly = isExample();
    $('sim-input').value = '';
    showError('sim-error', '');
    await nextOpponent();
  }

  function simMessages() {
    const s = state.sim;
    const msgs = [
      { role: 'system', content: buildSimSystemPrompt(s.persona, s.target, state.input && state.input.text) },
      { role: 'user', content: '（演练开始，请你先开口发难。）' }
    ];
    s.turns.forEach((t) => {
      msgs.push({ role: 'assistant', content: t.opponent });
      if (t.user !== null) msgs.push({ role: 'user', content: t.user });
    });
    return msgs;
  }

  async function nextOpponent() {
    const s = state.sim;
    if (isExample()) {
      const line = EXAMPLES[state.exampleIndex].sim.script[s.turns.length];
      s.turns.push({ opponent: line.opponent, user: null });
      $('sim-input').value = line.user; // 示例模式：你的台词也是写好的，点发送即可
      renderChat();
      return;
    }
    s.busy = true;
    renderChat();
    try {
      const text = await callChat(simMessages());
      if (state.sim !== s) return; // 用户已离开这局
      s.turns.push({ opponent: text.replace(/^["“「]|["”」]$/g, ''), user: null });
      showError('sim-error', '');
    } catch (err) {
      if (state.sim === s) showError('sim-error', err.message + (s.turns.length ? '' : ' 可以返回首页重试。'));
    } finally {
      s.busy = false;
      if (state.sim === s) renderChat();
    }
  }
