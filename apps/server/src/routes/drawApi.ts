export function renderDrawApiPage(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>SketchFlow · Secret studio</title>
    <style>
      :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
      * { box-sizing: border-box; }
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; overflow: hidden; color: #faf7ed; background: #151210; }
      body:before { content: ''; position: fixed; inset: 0; opacity: .28; pointer-events: none; background-image: linear-gradient(#78716c1f 1px, transparent 1px), linear-gradient(90deg, #78716c1f 1px, transparent 1px); background-size: 28px 28px; }
      .glow { position: fixed; width: 22rem; height: 22rem; border-radius: 50%; filter: blur(70px); opacity: .12; background: #fbbf24; top: 5%; left: -5%; }
      .card { position: relative; width: min(680px, calc(100% - 32px)); padding: clamp(24px, 6vw, 48px); border: 1px solid #ffffff1f; border-radius: 32px; background: #211e1be8; box-shadow: 0 24px 80px #0005; }
      header { display: flex; justify-content: space-between; align-items: center; }
      .brand { display: flex; align-items: center; gap: 12px; }
      .logo { display: grid; place-items: center; width: 44px; height: 44px; border-radius: 16px; color: #1c1917; background: #fcd34d; transform: rotate(-6deg); font-size: 23px; box-shadow: 0 8px 18px #0004; }
      .eyebrow { margin: 0; color: #fcd34d; font-size: 11px; font-weight: 800; letter-spacing: .16em; text-transform: uppercase; }
      h1 { max-width: 430px; margin: 34px 0 14px; font-size: clamp(40px, 8vw, 62px); line-height: .98; letter-spacing: -.06em; }
      p { max-width: 430px; color: #b8afa5; font-size: 15px; line-height: 1.7; }
      .actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 28px; }
      button { border: 0; border-radius: 10px; padding: 11px 15px; color: #1c1917; background: #fcd34d; font: inherit; font-weight: 750; cursor: pointer; }
      button:hover { background: #fde68a; transform: translateY(-1px); }
      button.secondary { color: #faf7ed; background: #ffffff12; }
      button.doodle { position: absolute; right: 30px; bottom: 32px; width: 160px; height: 160px; padding: 14px; border: 2px solid #faf7ed; border-radius: 30px; color: inherit; background: #faf7ed; box-shadow: 8px 8px #fcd34d; transform: rotate(5deg); animation: float 4s ease-in-out infinite; }
      button.doodle:hover { background: #fff; transform: rotate(3deg) translateY(-3px); }
      .doodle svg { width: 100%; height: 100%; overflow: visible; }
      .squiggle { transform-box: fill-box; transform-origin: center; animation: wiggle 3s ease-in-out infinite; }
      .stats { display: flex; justify-content: space-between; gap: 16px; margin-top: 34px; padding-top: 16px; border-top: 1px solid #ffffff1a; color: #8f877e; font-size: 12px; }
      .stats strong { color: #faf7ed; }
      @keyframes float { 50% { transform: rotate(-1deg) translateY(-7px); } }
      @keyframes wiggle { 25% { transform: rotate(3deg) scale(1.04,.97); } 50% { transform: rotate(-2deg) scale(.97,1.03); } 75% { transform: rotate(2deg) scale(1.03,.98); } }
      @media (max-width: 620px) { .doodle { position: relative; right: auto; bottom: auto; margin: 34px auto 0; } .stats { margin-top: 28px; } }
    </style>
  </head>
  <body><div class="glow"></div>
    <main class="card">
      <header><div class="brand"><div class="logo">✎</div><div><strong>SketchFlow</strong><div style="color:#8f877e;font-size:10px;letter-spacing:.18em;text-transform:uppercase">Secret studio</div></div></div><span style="font-size:22px;color:#fbbf24">✦</span></header>
      <section><p class="eyebrow">200 · Creativity found</p><h1 id="headline">A tiny masterpiece.</h1><p>You found the secret little corner of SketchFlow. Click the doodle and leave a little spark for everyone who visits.</p>
        <div class="actions"><button id="remix">✦ Remix the doodle</button><button id="party" class="secondary">✨ Party mode</button></div>
      </section>
      <button class="doodle" id="doodle" type="button" aria-label="Click to add to the collective counter"><svg viewBox="0 0 200 200"><path class="squiggle" d="M19 111C36 74 55 78 70 105s29 61 51 46 13-65 38-83 30 17 22 40-25 51-7 67" fill="none" stroke="#fcd34d" stroke-linecap="round" stroke-width="13"/><path d="M32 48 48 31l16 17-16 17Z" fill="#f97316"/><circle cx="155" cy="43" r="14" fill="#fcd34d"/><circle cx="155" cy="43" r="5" fill="#1c1917"/><path d="m117 35 7-12 7 12-7 12Z" fill="#8b5cf6"/></svg><span style="display:block;color:#1c1917;font-size:11px;font-weight:800;letter-spacing:.12em">CLICK ME</span></button>
      <footer class="stats"><span>Collective clicks: <strong id="count">…</strong></span><span>● imagination online</span></footer>
    </main>
    <script src="/drawapi.js" data-cfasync="false" defer></script>
  </body>
</html>`;
}

export function renderDrawApiScript(): string {
  return `
      const count = document.getElementById('count');
      const doodle = document.getElementById('doodle');
      const headline = document.getElementById('headline');
      const moods = ['A tiny masterpiece.', 'Maximum doodle energy.', 'A very serious squiggle.'];
      let mood = 0;
      fetch('/api/drawapi/counter').then(r => r.json()).then(data => count.textContent = data.clicks).catch(() => count.textContent = '—');
      function clickDoodle() { fetch('/api/drawapi/counter', { method: 'POST' }).then(r => r.json()).then(data => count.textContent = data.clicks).catch(() => {}); }
      doodle.addEventListener('click', clickDoodle);
      doodle.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); clickDoodle(); } });
      document.getElementById('remix').addEventListener('click', () => { mood = (mood + 1) % moods.length; headline.textContent = moods[mood]; });
      document.getElementById('party').addEventListener('click', event => { document.body.classList.toggle('party'); event.currentTarget.textContent = document.body.classList.contains('party') ? '🪩 Quiet mode' : '✨ Party mode'; });
`;
}
