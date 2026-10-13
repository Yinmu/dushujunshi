// 毒舌军师 · 主逻辑（原生 JS，无依赖）
// 只有 API 设置写 localStorage；所有输入、回复、对话都只在内存里，刷新即丢。
(function () {
  'use strict';

  const MAX_INPUT = 300;
  const DEFAULTS = { baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat' };
  const LS = { base: 'dsjs.baseUrl', key: 'dsjs.apiKey', model: 'dsjs.model' };
  const REASONS = ['太狠', '太软', '太长', '像 AI', '没理解'];

  // ---------- 内存状态 ----------
  const state = {
    exampleIndex: null, // null = AI 模式；数字 = 正在看第几个示例
    input: null, // { text, relation, goal }
    replies: [],
    feedback: {}, // { 卡片序号: { send: true/false, reason } }，只在内存，不上报
    sim: null
  };

  const $ = (id) => document.getElementById(id);

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([k, v]) => {
      if (k === 'text') node.textContent = v;
      else if (k === 'class') node.className = v;
      else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v);
    });
    (children || []).forEach((c) => c && node.appendChild(c));
    return node;
  }

  function showError(id, msg) {
    const box = $(id);
    box.textContent = msg || '';
    box.hidden = !msg;
  }

  let toastTimer = null;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 1800);
  }

  function showView(name) {
    ['input', 'result', 'sim'].forEach((v) => { $('view-' + v).hidden = v !== name; });
    window.scrollTo(0, 0);
  }

  function isExample() { return state.exampleIndex !== null; }

  function syncExampleMarks() {
    document.querySelectorAll('.example-only').forEach((n) => { n.hidden = !isExample(); });
  }

  // ---------- 设置（localStorage 只存这三项） ----------
  function getConfig() {
    return {
      baseUrl: localStorage.getItem(LS.base) || DEFAULTS.baseUrl,
      key: localStorage.getItem(LS.key) || '',
      model: localStorage.getItem(LS.model) || DEFAULTS.model
    };
  }

  function renderConfig() {
    const cfg = getConfig();
    $('cfg-base').value = cfg.baseUrl;
    $('cfg-key').value = cfg.key;
    $('cfg-model').value = cfg.model;
    $('key-status').textContent = cfg.key ? '已填写' : '未填写';
    $('footer-model').textContent = cfg.model;
  }

  function saveConfig() {
    const base = $('cfg-base').value.trim() || DEFAULTS.baseUrl;
    const key = $('cfg-key').value.trim();
    const model = $('cfg-model').value.trim() || DEFAULTS.model;
    localStorage.setItem(LS.base, base);
    localStorage.setItem(LS.model, model);
    if (key) localStorage.setItem(LS.key, key);
    else localStorage.removeItem(LS.key);
    renderConfig();
    toast('已保存到本机浏览器');
  }

  function clearKey() {
    localStorage.removeItem(LS.key);
    renderConfig();
    toast('key 已清除');
  }

  // ---------- 调用 OpenAI 兼容接口 ----------
  async function callChat(messages) {
    const cfg = getConfig();
    if (!cfg.key) throw new Error('还没填 API key：点上面的「API 设置」填一下，或者先点「看看示例」。');
    const url = cfg.baseUrl.replace(/\/+$/, '') + '/chat/completions';
    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + cfg.key },
        body: JSON.stringify({ model: cfg.model, messages, max_tokens: 800 })
      });
    } catch (e) {
      throw new Error('网络请求失败：检查网络、Base URL 是否写对，或该接口是否允许浏览器直接调用（CORS）。');
    }
    if (!res.ok) {
      let detail = '';
      try { detail = ((await res.json()).error || {}).message || ''; } catch (e) { /* 忽略 */ }
      const hints = {
        400: '请求参数有误，检查模型名是否正确',
        401: 'API key 无效或已过期',
        402: '账户余额不足',
        403: '没有权限调用这个模型',
        404: '接口地址或模型名不存在，检查 Base URL 和模型名',
        429: '请求太频繁或额度用完了，稍后再试'
      };
      const hint = hints[res.status] || (res.status >= 500 ? '模型服务暂时出错，稍后再试' : '请求失败');
      throw new Error(`${hint}（HTTP ${res.status}${detail ? '：' + detail : ''}）`);
    }
    let data;
    let raw = '';
    const ct = (res.headers && res.headers.get('content-type')) || '（无）';
    try { raw = await res.text(); } catch (e) { throw new Error(`接口响应读取失败（HTTP ${res.status}）。请把这段完整报错发给开发者排查。`); }
    try { data = JSON.parse(raw); } catch (e) {
      const preview = raw.slice(0, 200).replace(/\s+/g, ' ');
      throw new Error(`接口返回的不是 JSON（HTTP ${res.status}，Content-Type: ${ct}，body 前200字符：「${preview}」）。请把这段完整报错发给开发者排查。`);
    }
    const content = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (!content) throw new Error('模型返回了空内容，再试一次。');
    return content.trim();
  }

  // ---------- 测试连接：最小请求 + 全诊断输出 ----------
  async function testConnection() {
    const out = $('cfg-test-out');
    out.hidden = false;
    const base = $('cfg-base').value.trim() || DEFAULTS.baseUrl;
    const key = $('cfg-key').value.trim();
    const model = $('cfg-model').value.trim() || DEFAULTS.model;
    if (!key) { out.value = '还没填 API key，先填上再测。'; return; }
    const url = base.replace(/\/+$/, '') + '/chat/completions';
    out.value = '正在测试…';
    const t0 = Date.now();
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
        body: JSON.stringify({ model, messages: [{ role: 'user', content: 'hi' }], max_tokens: 5 })
      });
      const ct = (res.headers && res.headers.get('content-type')) || '（无）';
      const raw = await res.text();
      const ms = Date.now() - t0;
      let parsed;
      try {
        const d = JSON.parse(raw);
        const reply = d && d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content;
        const errMsg = d && d.error && d.error.message;
        parsed = reply ? `模型回复：「${String(reply).slice(0, 100)}」` : (errMsg ? `接口报错：${errMsg}` : 'JSON 能解析，但没有 choices 内容');
      } catch (e) {
        parsed = `body 不是 JSON，前200字符：「${raw.slice(0, 200).replace(/\s+/g, ' ')}」`;
      }
      out.value = `URL: ${url}\n模型: ${model}\nHTTP: ${res.status}（${ms}ms）\nContent-Type: ${ct}\n${parsed}`;
    } catch (e) {
      out.value = `请求没发出去：${e && e.message ? e.message : e}\n（可能是网络问题、Base URL 写错，或接口不允许浏览器直接调用）`;
    }
  }

  function parseJSON(text) {
    const cleaned = text.replace(/```(?:json)?/gi, '');
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start === -1 || end <= start) throw new Error('bad json');
    return JSON.parse(cleaned.slice(start, end + 1));
  }

  // ---------- 复制（clipboard 失败时降级 textarea） ----------
  function fallbackCopy(text) {
    const ta = el('textarea', { readonly: '', style: 'position:fixed;top:0;left:0;opacity:0;' });
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    return ok;
  }

  async function copyText(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        toast('已复制');
        return;
      }
    } catch (e) { /* 降级 */ }
    toast(fallbackCopy(text) ? '已复制' : '复制失败，请长按文字手动复制');
  }

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
    $('composer').hidden = false;
    $('btn-sim-end').hidden = false;
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
      s.opponentFailed = false;
      showError('sim-error', '');
    } catch (err) {
      s.opponentFailed = true;
      if (state.sim === s) showError('sim-error', err.message + (s.turns.length ? '' : ' 可以返回首页重试。'));
    } finally {
      s.busy = false;
      if (state.sim === s) renderChat();
    }
  }

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
    const lastFailed = !s.busy && !s.ended && !!s.opponentFailed;
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
    $('composer').hidden = true;
    $('btn-sim-end').hidden = true;
    $('sim-review').hidden = false;
    $('sim-review').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ---------- 初始化 ----------
  function init() {
    renderConfig();
    resetInput(); // 浏览器可能自动回填表单，这里强制清空：刷新即丢
    setupChips($('relation-chips'));
    setupChips($('goal-chips'));
    setupChips($('target-chips'));
    setupChips($('persona-chips'));

    $('cfg-save').addEventListener('click', saveConfig);
    $('cfg-clear').addEventListener('click', clearKey);
    $('cfg-test').addEventListener('click', testConnection);
    // 常用模型：只填输入框，不自动保存
    $('cfg-presets').querySelectorAll('button[data-model]').forEach((btn) => {
      btn.addEventListener('click', () => {
        $('cfg-base').value = btn.dataset.base;
        $('cfg-model').value = btn.dataset.model;
      });
    });
    $('input-text').addEventListener('input', updateCount);
    $('input-form').addEventListener('submit', onGenerate);
    $('btn-example').addEventListener('click', () => startExample(0));
    $('btn-next-example').addEventListener('click', () => startExample((state.exampleIndex + 1) % EXAMPLES.length));
    $('btn-restart').addEventListener('click', backHome);
    $('btn-to-sim').addEventListener('click', openSimSetup);
    $('btn-sim-start').addEventListener('click', startSim);
    $('btn-sim-send').addEventListener('click', onSimSend);
    $('btn-sim-end').addEventListener('click', endSim);
    $('btn-sim-again').addEventListener('click', openSimSetup);
    $('btn-sim-back').addEventListener('click', backHome);
    $('sim-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); onSimSend(); }
    });
  }

  function backHome() {
    state.exampleIndex = null;
    state.input = null;
    state.replies = [];
    state.feedback = {};
    state.sim = null;
    syncExampleMarks();
    resetInput();
    showView('input');
  }

  window.addEventListener('pageshow', (e) => { if (e.persisted) backHome(); }); // 从 bfcache 返回也清空
  document.addEventListener('DOMContentLoaded', init);
})();
