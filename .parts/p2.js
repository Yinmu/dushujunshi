
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
        body: JSON.stringify({ model: cfg.model, messages, max_tokens: 800, temperature: 0.9 })
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
    try { data = await res.json(); } catch (e) { throw new Error('接口返回的不是 JSON，检查 Base URL 是否是 OpenAI 兼容接口。'); }
    const content = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (!content) throw new Error('模型返回了空内容，再试一次。');
    return content.trim();
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
