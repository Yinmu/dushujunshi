
  // ---------- 结果页：三张军师卡片 ----------
  function renderResult() {
    syncExampleMarks();
    const inp = state.input;
    $('result-meta').textContent = `对方是你的${inp.relation} · 目标：${inp.goal}`;
    $('result-quote').textContent = inp.text;
    $('sim-cta-text').textContent = inp.goal === '我想提前练练'
      ? '你选了「提前练练」：去模拟器里让对方先怼你几轮。'
      : '说完就完了？对方大概率还会接着怼，去模拟器预演一下。';
    const box = $('cards');
    box.textContent = '';
    state.replies.forEach((r, i) => box.appendChild(renderCard(r, i)));
    showView('result');
  }

  function renderCard(r, i) {
    const badge = isExample()
      ? el('span', { class: 'badge example', text: '示例内容，非 AI 生成' })
      : el('span', { class: 'badge', text: 'AI 生成' });
    const reasons = el('div', { class: 'feedback-reasons', hidden: '' }, [
      el('div', { class: 'tip', text: '为什么不会发？' }),
      el('div', { class: 'chips' }, REASONS.map((name) => el('button', { type: 'button', class: 'chip', 'data-value': name, text: name })))
    ]);
    const thanks = el('p', { class: 'thanks', hidden: '' });
    const sendBtn = el('button', { type: 'button', class: 'btn ghost', text: '我会发' });
    const noBtn = el('button', { type: 'button', class: 'btn ghost', text: '不会发' });

    function choose(send) {
      state.feedback[i] = { send };
      sendBtn.classList.toggle('primary', send);
      noBtn.classList.toggle('primary', !send);
      reasons.hidden = send;
      thanks.hidden = !send;
      thanks.textContent = send ? '收到！这条进了你的弹药库（只记在本页，不上报）。' : '';
      if (!send) reasons.querySelectorAll('.chip').forEach((c) => c.classList.remove('active'));
    }
    sendBtn.addEventListener('click', () => choose(true));
    noBtn.addEventListener('click', () => choose(false));
    setupChips(reasons.querySelector('.chips'), (reason) => {
      state.feedback[i] = { send: false, reason };
      thanks.hidden = false;
      thanks.textContent = `收到：「${reason}」。只记在本页内存，不上报任何地方。`;
    });

    return el('article', { class: 'card' }, [
      badge,
      el('h3', { text: r.strategist }),
      el('p', { class: 'strategy', text: '策略：' + r.strategy }),
      el('p', { class: 'reply', text: r.reply }),
      el('p', { class: 'consequence', text: '可能后果：' + r.consequence }),
      el('div', { class: 'row' }, [
        el('button', { type: 'button', class: 'btn', text: '复制', onclick: () => copyText(r.reply) }),
        sendBtn,
        noBtn
      ]),
      reasons,
      thanks
    ]);
  }
