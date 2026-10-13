
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
