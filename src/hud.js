import './hud.css'
import { Vector3 } from 'three'
import { DAILY, REBIRTH, UPGRADES } from './config.js'
import * as bloxity from './bloxity.js'
import { buyUpgrade, claimDaily, compact, dailyLeft, onChange, rebirth, rebirthCost, state, upgradeCost, upgradeLevel, upgradeValue } from './progress.js'
import * as sound from './audio/index.js'

// The DOM overlay drawn over the game: stats, buttons, timers, the train's health bar,
// prompts anchored to the world, damage numbers and the windows.

const LEAF = 'M0 8C-9-6-31-13-32-30-33-42-17-47-8-40-4-37-1-33 0-29 1-33 4-37 8-40 17-47 33-42 32-30 31-13 9-6 0 8z'
const leaves = (paint, turn = 0) => [[-45, '#8cf84e'], [45, '#3cec30'], [135, '#74ee5a'], [225, '#26c83c']].map(([a, c]) => `<path transform="rotate(${a + turn})" d="${LEAF}" ${paint(c)}/>`).join('')

const I = {
  bicep: (a, b, s = '#2a1200') => `<svg viewBox="-4 -4 108 108"><path d="M24 6C36 3 50 3 56 8 62 14 61 24 56 31 53 36 53 42 54 47 60 43 70 42 78 44 90 47 99 55 99 66 99 78 90 85 76 87 66 92 46 96 32 92 16 91 3 84 2 70 1 58 8 46 14 38 9 30 10 12 24 6z" fill="url(#g${a.slice(1)})" stroke="${s}" stroke-width="5" stroke-linejoin="round"/><defs><linearGradient id="g${a.slice(1)}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs></svg>`,
  coin: '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="44" fill="#d99a12" stroke="#3a2500" stroke-width="5"/><circle cx="50" cy="50" r="34" fill="#ffd23c" stroke="#a87208" stroke-width="4"/><rect x="31" y="33" width="38" height="28" rx="6" fill="#a87208"/><rect x="36" y="38" width="28" height="11" rx="2" fill="#ffe89a"/><circle cx="40" cy="67" r="5" fill="#a87208"/><circle cx="60" cy="67" r="5" fill="#a87208"/></svg>',
  clover: `<svg viewBox="0 0 100 100"><g transform="translate(50 50) scale(0.9)" stroke-linejoin="round"><g transform="translate(-2 3)">${leaves(() => 'fill="#0c1a10" stroke="#0c1a10" stroke-width="10"', 45)}${leaves(() => 'fill="#14a838"', 45)}</g>${leaves(() => 'fill="#0c1a10" stroke="#0c1a10" stroke-width="7"')}${leaves((c) => `fill="${c}"`)}<g transform="scale(0.6)" opacity="0.3">${leaves(() => 'fill="#eaffd8"')}</g></g></svg>`,
  warn: '<svg viewBox="0 0 100 92"><defs><linearGradient id="gwarn" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffdf5a"/><stop offset="1" stop-color="#ff9a1c"/></linearGradient></defs><path d="M50 12 90 82H10z" fill="url(#gwarn)" stroke="url(#gwarn)" stroke-width="14" stroke-linejoin="round"/><rect x="44" y="30" width="12" height="32" rx="6" fill="#3a2500"/><circle cx="50" cy="73" r="6.5" fill="#3a2500"/></svg>',
  store: '<svg viewBox="0 0 100 90"><path d="M28 34 42 8M72 34 58 8" stroke="#6b5a8a" stroke-width="7" stroke-linecap="round"/><path d="M8 34h84l-8 44c-1 5-5 8-10 8H26c-5 0-9-3-10-8z" fill="#e8222c" stroke="#3a0508" stroke-width="5" stroke-linejoin="round"/><path d="M6 32h88v10H6z" fill="#ff5a64" stroke="#3a0508" stroke-width="5"/><path d="M30 50v24M50 50v24M70 50v24" stroke="#8c0d14" stroke-width="6" stroke-linecap="round"/></svg>',
  rebirth: `<svg viewBox="0 0 100 90"><image href="${import.meta.env.BASE_URL}ui/rebirth.png" x="5" y="0" width="90" height="90" preserveAspectRatio="xMidYMid meet"/></svg>`,
  train: '<svg viewBox="0 0 100 100"><rect x="14" y="8" width="72" height="72" rx="20" fill="#ff5fa2" stroke="#2a0a1a" stroke-width="5"/><rect x="24" y="18" width="52" height="30" rx="8" fill="#202634" stroke="#2a0a1a" stroke-width="3"/><rect x="28" y="22" width="44" height="10" rx="3" fill="#3a4a66"/><circle cx="30" cy="62" r="7" fill="#fff" stroke="#2a0a1a" stroke-width="3"/><circle cx="70" cy="62" r="7" fill="#fff" stroke="#2a0a1a" stroke-width="3"/><rect x="42" y="56" width="16" height="12" rx="3" fill="#f2f2f6" stroke="#2a0a1a" stroke-width="3"/><rect x="26" y="78" width="12" height="14" rx="3" fill="#202634"/><rect x="62" y="78" width="12" height="14" rx="3" fill="#202634"/><rect x="18" y="88" width="64" height="7" rx="3" fill="#4a4a58"/></svg>',
  gift: '<svg viewBox="0 0 100 90"><rect x="16" y="42" width="68" height="44" rx="6" fill="#5a32d0" stroke="#1d0a3a" stroke-width="5"/><rect x="10" y="30" width="80" height="18" rx="5" fill="#7a4cf0" stroke="#1d0a3a" stroke-width="5"/><rect x="42" y="30" width="16" height="56" fill="#ffc53a" stroke="#6a4500" stroke-width="4"/><path d="M50 30C36 6 12 8 16 20c3 10 22 11 34 10zM50 30C64 6 88 8 84 20c-3 10-22 11-34 10z" fill="#ffc53a" stroke="#6a4500" stroke-width="5"/></svg>',
  faces: '<svg viewBox="0 0 136 100"><rect x="62" y="12" width="66" height="72" rx="20" fill="#f2b92c" stroke="#3a2a00" stroke-width="5"/><rect x="8" y="18" width="70" height="74" rx="22" fill="#ffd92e" stroke="#3a2a00" stroke-width="5"/><circle cx="30" cy="48" r="5" fill="#2a2000"/><circle cx="56" cy="48" r="5" fill="#2a2000"/><path d="M28 66q15 12 30 0" fill="none" stroke="#2a2000" stroke-width="5" stroke-linecap="round"/></svg>',
  car: '<svg viewBox="0 0 120 100" class="art"><path d="M16 56l8-24c2-6 7-10 14-10h44c7 0 12 4 14 10l8 24c5 2 8 6 8 12v18H8V68c0-6 3-10 8-12z" fill="#e4232c" stroke="#2a0508" stroke-width="5" stroke-linejoin="round"/><path d="M30 54l6-20c1-3 3-4 6-4h36c3 0 5 1 6 4l6 20z" fill="#2a3244" stroke="#2a0508" stroke-width="4"/><circle cx="28" cy="70" r="8" fill="#fff" stroke="#2a0508" stroke-width="3"/><circle cx="92" cy="70" r="8" fill="#fff" stroke="#2a0508" stroke-width="3"/><rect x="44" y="64" width="32" height="12" rx="3" fill="#2a0508"/><rect x="14" y="84" width="20" height="12" rx="3" fill="#17171c"/><rect x="86" y="84" width="20" height="12" rx="3" fill="#17171c"/></svg>',
  magnet: '<svg viewBox="0 0 100 100"><path d="M14 74C2 40 22 8 52 8s50 32 34 66L64 62c8-18 2-34-12-34s-20 16-12 34z" fill="#e8222c" stroke="#1d0508" stroke-width="6" stroke-linejoin="round"/><path d="M10 80l22-12 12 14-18 14zM68 70l22 10-4 14-18-6z" fill="#f4f6ff" stroke="#1d0508" stroke-width="5" stroke-linejoin="round"/></svg>',
  hourglass: '<svg viewBox="0 0 100 100"><path d="M26 12h48c0 26-12 34-14 38 2 4 14 12 14 38H26c0-26 12-34 14-38-2-4-14-12-14-38z" fill="#bfeaff" stroke="#1d0a3a" stroke-width="6" stroke-linejoin="round"/><path d="M34 18h32c-2 14-10 22-16 24-6-2-14-10-16-24z" fill="#ff9a1c"/><path d="M50 56c8 8 14 14 16 26H34c2-12 8-18 16-26z" fill="#ff9a1c"/><rect x="18" y="4" width="64" height="12" rx="5" fill="#d98a3a" stroke="#1d0a3a" stroke-width="5"/><rect x="18" y="86" width="64" height="12" rx="5" fill="#d98a3a" stroke="#1d0a3a" stroke-width="5"/></svg>',
  fuse: '<svg viewBox="0 0 100 100"><rect x="22" y="14" width="56" height="78" rx="10" fill="#1f7aff" stroke="#08204f" stroke-width="6"/><rect x="32" y="26" width="36" height="52" rx="6" fill="#40e8ff" stroke="#08204f" stroke-width="4"/><rect x="42" y="34" width="16" height="36" rx="4" fill="#e6ffff"/><rect x="30" y="4" width="40" height="14" rx="4" fill="#ffd21a" stroke="#08204f" stroke-width="4"/></svg>',
  shoe: '<svg viewBox="0 0 100 100"><path d="M10 62c0-14 8-26 20-34l12 10 16-4 24 24c6 6 10 8 10 18H12c-2-4-2-8-2-14z" fill="#1f9aff" stroke="#08204f" stroke-width="6" stroke-linejoin="round"/><path d="M12 80h82v10c0 4-4 6-8 6H18c-4 0-6-4-6-8z" fill="#f4f8ff" stroke="#08204f" stroke-width="5" stroke-linejoin="round"/><path d="M44 40l8 8M54 36l8 8" stroke="#fff" stroke-width="5" stroke-linecap="round"/></svg>',
  robux: '<svg viewBox="0 0 100 100"><path d="M50 6 88 28v44L50 94 12 72V28z" fill="#bfff3a" stroke="#12300a" stroke-width="6" stroke-linejoin="round"/><path d="M50 28 69 39v22L50 72 31 61V39z" fill="#3f9a2a" stroke="#12300a" stroke-width="5" stroke-linejoin="round"/></svg>',
}

const ART = { magnet: I.magnet, hourglass: I.hourglass, fuse: I.fuse, shoe: I.shoe, carry: I.bicep('#ffe22e', '#ffa512') }
const DAY_ART = { coins: I.coin, power: I.bicep('#ffc22e', '#ff7a12'), luck: I.clover, carry: I.car, rebirth: I.rebirth, powerMult: I.bicep('#f46cff', '#c826ee', '#0c0814') }

export const ICONS = I

const el = (tag, cls, html = '') => {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  e.innerHTML = html
  return e
}

const v3 = new Vector3()

function hms(s) {
  const t = Math.max(0, Math.ceil(s))
  return `${Math.floor(t / 3600)}h ${Math.floor(t / 60) % 60}m ${t % 60}s`
}

function clock(s) {
  const t = Math.max(0, Math.ceil(s))
  const p = (n) => String(n).padStart(2, '0')
  return `${p(Math.floor(t / 3600))}:${p(Math.floor(t / 60) % 60)}:${p(t % 60)}`
}

export function createHud({ onDrop, onStop, onHoldStart, onHoldEnd, railCap, onFuse }) {
  const root = el('div', 'hud')
  document.body.appendChild(root)

  // Top centre.
  const top = el('div', 'hud-top')
  const timer = el('div', '', `<div class="hud-timer-title">TRAIN COMING IN:</div><div class="hud-timer-secs st">0 SECONDS</div>`)
  const barWrap = el('div', 'hud-train-wrap', `<div class="hud-train-icon">${I.train}</div><div class="hud-bar"><div class="hud-bar-fill"></div><div class="hud-bar-text st">0 HP</div></div><div class="hud-bar-name st"><span></span>( ${I.coin}<b></b> )</div>`)
  barWrap.style.display = 'none'
  const next = el('div', 'hud-next', `<div class="a st">NEXT TRAIN IS:</div><div class="b"></div><div class="c">X2 COINS</div>`)
  next.style.display = 'none'
  top.append(timer, barWrap, next)
  const nextName = next.querySelector('.b')
  const nextX2 = next.querySelector('.c')
  const title = timer.querySelector('.hud-timer-title')
  const secs = timer.querySelector('.hud-timer-secs')
  const bar = barWrap.querySelector('.hud-bar')
  const fill = barWrap.querySelector('.hud-bar-fill')
  const hpText = barWrap.querySelector('.hud-bar-text')
  const nameEl = barWrap.querySelector('.hud-bar-name span')
  const rewardEl = barWrap.querySelector('.hud-bar-name b')

  // Left column.
  const left = el('div', 'hud-left')
  const stat = (svg, cls = '') => {
    const s = el('div', `hud-stat ${cls}`, `${svg}<span class="st">0</span>`)
    left.appendChild(s)
    return s
  }
  const multi = stat(I.bicep('#ee5cff', '#8a1ce0', '#1d0a3a'), 'small')
  const power = stat(I.bicep('#ffc22e', '#ff7a12'))
  const coins = stat(I.coin)
  const luck = stat(I.clover)
  left.appendChild(el('div', 'hud-sep'))
  const grid = el('div', 'hud-grid')
  const hudBtn = (svg, label, color, fn) => {
    const b = el('button', 'hud-btn', `${svg}<span class="st" style="color:${color}">${label}</span>`)
    b.type = 'button'
    b.addEventListener('click', fn)
    grid.appendChild(b)
    return b
  }
  const rebirthBtn = hudBtn(I.rebirth, 'REBIRTH', '#ff7af0', () => openWindow('rebirth'))
  const rebirthBadge = rebirthBtn.appendChild(el('div', 'hud-badge st', '!'))
  const upBtn = hudBtn(I.train, 'UPGRADE', '#ffffff', () => openWindow('upgrade'))
  const badge = el('div', 'hud-badge st', '!')
  upBtn.appendChild(badge)
  const dailyBtn = hudBtn(I.gift, 'DAILY', '#ffffff', () => openWindow('daily'))
  const dailyLabel = el('small', 'st', '')
  dailyBtn.appendChild(dailyLabel)
  left.appendChild(grid)

  // Right column.
  const right = el('div', 'hud-right')
  const offer = (art, price, html) => {
    const b = el('button', 'hud-offer', `<div class="hud-price st">${I.robux}${price}</div>${art}<span class="st">${html}</span>`)
    b.type = 'button'
    b.addEventListener('click', () => openWindow('store'))
    right.appendChild(b)
  }
  offer(I.bicep('#ffc22e', '#ff7a12').replace('<svg', '<svg class="art"'), 3, '<span class="c-yellow">x2</span> <span class="c-rainbow2">POWER</span>')
  offer(I.car, 24, '<span class="c-yellow">+1</span> <span class="c-rainbow2">CARRY</span>')

  // Bottom.
  const friend = el('div', 'hud-friend', `${I.faces}<span class="st">Friend Boost: <em>+0%</em></span>`)
  const plus = el('button', 'hud-plus st', '+')
  plus.type = 'button'
  plus.addEventListener('click', () => toast('Friend boosts arrive with multiplayer'))
  friend.appendChild(plus)
  const comeback = el('div', 'hud-comeback', '<div class="a st">(COMEBACK TOMORROW)</div><div class="b st"><i>YOU</i> <i>EARN</i> <i>POWER</i> <i>OFFLINE!</i></div>')
  const drop = el('button', 'hud-drop st', 'DROP CAR')
  drop.type = 'button'
  drop.addEventListener('click', onDrop)
  const stopBtn = el('button', 'hud-drop hud-stop st', 'STOP TRAINING')
  stopBtn.type = 'button'
  stopBtn.addEventListener('click', onStop)

  // Prompt.
  const prompt = el('div', 'hud-prompt', `<div class="hud-key"><svg viewBox="0 0 40 40"><rect class="bg" x="3" y="3" width="34" height="34" rx="7"/><rect class="fg" x="3" y="3" width="34" height="34" rx="7" pathLength="100" stroke-dasharray="0 100"/></svg><span>E</span></div><span class="t">Grab</span>`)
  const ringFg = prompt.querySelector('.fg')
  const promptText = prompt.querySelector('.t')
  prompt.addEventListener('pointerdown', (e) => {
    e.preventDefault()
    try {
      prompt.setPointerCapture(e.pointerId)
    } catch {
      // Already gone.
    }
    onHoldStart()
  })
  const lift = () => onHoldEnd()
  prompt.addEventListener('pointerup', lift)
  prompt.addEventListener('pointercancel', lift)
  prompt.addEventListener('lostpointercapture', lift)

  const banner = el('div', 'hud-banner', '<h2></h2><p class="st"></p>')
  const toastEl = el('div', 'hud-toast')
  const flash = el('div', 'hud-flash')
  const back = el('div', 'hud-win-back')
  root.append(flash, top, left, right, friend, comeback, drop, stopBtn, prompt, banner, toastEl, back)

  // Reserved corners of the portal: keep the top row clear of them on narrow screens.
  bloxity.onReservedAreas((areas) => {
    const w = window.innerWidth
    let reserve = 0
    for (const a of areas) {
      const r = a.rect ?? a
      if ((r.width ?? 0) > w * 0.4 || (r.right ?? 0) > w * 0.3) reserve = Math.max(reserve, (r.y ?? r.top ?? 0) + (r.height ?? 0))
    }
    root.style.setProperty('--reserve-top', `${reserve}px`)
  })

  // Stats.
  let lastCoins = null
  let lastPower = null
  onChange((s) => {
    multi.lastChild.textContent = `x${s.multiplier}`
    power.lastChild.textContent = compact(s.power)
    coins.lastChild.textContent = compact(s.coins)
    luck.lastChild.textContent = `${s.luck}%`
    if (lastCoins !== null && s.coins !== lastCoins) replay(coins, 'pop')
    if (lastPower !== null && s.power !== lastPower) replay(power, 'pop')
    lastCoins = s.coins
    lastPower = s.power
    badge.style.display = UPGRADES.some((u) => upgradeLevel(u.id) < u.max && s.coins >= upgradeCost(u.id)) ? '' : 'none'
    rebirthBadge.style.display = s.power >= rebirthCost() ? '' : 'none'
    if (back.classList.contains('on') && current === 'rebirth') fillRebirth()
    else if (back.classList.contains('on') && current === 'upgrade') {
      if (upgradeSig() !== upSig) render('upgrade')
    } else if (back.classList.contains('on') && (current === 'daily' || current === 'fuse')) {
      // the timer ticks in update()
    } else if (back.classList.contains('on') && current) render(current)
  })
  function replay(e, cls) {
    e.classList.remove(cls)
    void e.offsetWidth
    e.classList.add(cls)
  }

  // Windows.
  let current = null
  let upSig = ''
  let fuseInfo = { names: '', chance: 0, cost: 0 }
  let dailyReady = false
  const upgradeSig = () => UPGRADES.map((u) => `${upgradeLevel(u.id)}${state.coins >= upgradeCost(u.id) ? 'y' : 'n'}`).join()
  // Filled in place: Strength streams in during training, and rebuilding the buttons would drop a click.
  function fillRebirth() {
    const need = rebirthCost()
    win.querySelector('.mult').textContent = `x${state.multiplier + 1}`
    win.querySelector('.luck').textContent = `${state.luck + REBIRTH.luck}%`
    win.querySelector('.fill').style.width = `${Math.min(1, state.power / need) * 100}%`
    win.querySelector('.count').textContent = `${compact(state.power)}/${compact(need)}`
  }
  function render(kind) {
    const close = '<button type="button" class="x st" data-close>X</button>'
    const go = (id, label, enabled) => `<button type="button" class="hud-go st" data-go="${id}" ${enabled ? '' : 'disabled'}>${label}</button>`
    if (kind === 'upgrade') {
      const keep = win.querySelector('.list')?.scrollTop ?? 0
      upSig = upgradeSig()
      const rows = UPGRADES.map((u) => {
        const lvl = upgradeLevel(u.id)
        const c = upgradeCost(u.id)
        const buys =
          lvl >= u.max
            ? '<div class="maxed st">MAX</div>'
            : `<button type="button" class="coin st${state.coins < c ? ' poor' : ''}" data-go="${u.id}">${I.coin}<span>${compact(c)}</span></button><button type="button" class="rbx st" data-go="rbx:${u.id}">${I.robux}<span>${u.robux}</span></button>`
        return `<div class="row${u.caps ? ' caps' : ''}" style="background-image:linear-gradient(${u.horizontal ? 90 : 180}deg,${u.c1},${u.c2})"><div class="ico">${ART[u.art]}<b class="st">Lv.${lvl}</b></div><div class="info"><div class="name st">${u.title}</div><div class="desc st">${u.fmt(upgradeValue(u.id))}</div></div><div class="buys">${buys}</div></div>`
      }).join('')
      win.innerHTML = `<div class="head"><h3 class="grad" data-t="UPGRADES!">UPGRADES!</h3>${close}</div><div class="list">${rows}</div>`
      win.querySelector('.list').scrollTop = keep
    } else if (kind === 'rebirth') {
      win.innerHTML = `<div class="head"><h3 class="grad" data-t="REBIRTH!">REBIRTH!</h3><button type="button" class="x st" data-close>X</button></div>
        <div class="body">
          <div class="unlock st">YOU UNLOCK:</div>
          <div class="slots"><div class="slot">${I.bicep('#f46cff', '#c826ee', '#0c0814')}<b class="mult st"></b></div><div class="slot">${I.clover}<b class="luck st"></b></div></div>
          <div class="warn">${I.warn}<span class="grad" data-t="REBIRTH RESETS YOUR POWER!">REBIRTH RESETS YOUR POWER!</span>${I.warn}</div>
          <div class="bar"><div class="fill"></div><div class="text st"><span class="count"></span>${I.bicep('#ffc22e', '#ff7a12')}</div></div>
          <div class="btns">
            <button type="button" class="go st" data-go="rebirth">REBIRTH</button>
            <button type="button" class="skip" data-go="skip"><div class="hud-price st">${I.robux}${REBIRTH.skipRobux}</div><span class="st">SKIP REBIRTH</span><small class="grad" data-t="(KEEP YOUR POWER!)">(KEEP YOUR POWER!)</small></button>
          </div>
        </div>`
      fillRebirth()
    } else if (kind === 'daily') {
      const left2 = dailyLeft()
      dailyReady = left2 <= 0
      const done = dailyReady ? state.dailyDay % DAILY.length : Math.min(state.dailyDay, DAILY.length)
      const card = (g, i) => {
        const big = i === DAILY.length - 1
        const btn =
          i < done
            ? '<div class="state claimed st">Claimed</div>'
            : i === done && dailyReady
              ? '<button type="button" class="state claim st" data-go="claim">CLAIM</button>'
              : '<div class="state locked st">LOCKED</div>'
        return `<div class="card d${i + 1}${big ? ' big' : ''}"><div class="day st">Day ${i + 1}</div><div class="art">${DAY_ART[g.kind]}</div><div class="amt st">${g.text}</div>${g.sub ? `<div class="sub st">${g.sub}</div>` : ''}${btn}${g.tag ? `<div class="tag st">${g.tag}</div>` : ''}</div>`
      }
      win.innerHTML = `<div class="head"><div class="gift">${I.gift}</div><h3 class="grad" data-t="DAILY REWARDS!">DAILY REWARDS!</h3><span class="next st">${dailyReady ? 'Your gift is ready!' : `Next Gift in ${hms(left2)}`}</span>${close}</div><div class="days">${DAILY.map(card).join('')}</div>`
    } else if (kind === 'fuse') {
      const f = fuseInfo
      win.innerHTML = `<div class="head"><h3 class="grad" data-t="FUSE CONFIRMATION">FUSE CONFIRMATION</h3>${close}</div><div class="body"><p class="ask st">Are you sure you want to fuse (${f.names})?</p><div class="chance">${I.clover}<b class="st">${f.chance}%</b></div><button type="button" class="go st${state.coins < f.cost ? ' poor' : ''}" data-go="fuse">${I.coin}<span>${compact(f.cost)}</span></button></div>`
    } else if (kind === 'store') {
      win.innerHTML = `${close}<h3 class="st">STORE</h3><div class="hud-row"><div><strong class="st">x2 Power</strong><p>Coming soon</p></div>${go('none', 'SOON', false)}</div><div class="hud-row"><div><strong class="st">+1 Carry</strong><p>Coming soon</p></div>${go('none', 'SOON', false)}</div><div class="hud-row"><div><strong class="st">Admin Bench</strong><p>x200 Power on the rainbow bench. Coming soon</p></div>${go('none', 'SOON', false)}</div>`
    } else if (kind === 'feedback') {
      win.innerHTML = `${close}<h3 class="st">FEEDBACK</h3><div class="hud-row"><div><strong class="st">Coming soon</strong><p>The mailbox opens once the game has its server. Thanks for stopping by!</p></div></div>`
    }
  }
  const win = el('div', 'hud-win')
  back.appendChild(win)
  function openWindow(kind) {
    current = kind
    const reborn = ['rebirth', 'upgrade', 'daily', 'fuse'].includes(kind)
    win.className = reborn ? `hud-rb ${kind === 'rebirth' ? '' : kind}` : 'hud-win'
    win.innerHTML = ''
    back.classList.toggle('clear', reborn)
    document.body.classList.toggle('hud-blur', reborn)
    render(kind)
    back.classList.add('on')
    sound.windowOpen()
    sound.setDucked(true)
  }
  function closeWindow() {
    back.classList.remove('on')
    document.body.classList.remove('hud-blur')
    current = null
    sound.setDucked(false)
  }
  back.addEventListener('click', (e) => {
    if (e.target === back || e.target.closest('[data-close]')) return closeWindow()
    const go = e.target.closest('[data-go]')?.dataset.go
    if (!go) return
    if (go === 'rebirth') {
      if (rebirth()) {
        closeWindow()
        sound.victory()
        flashK = 0.7
        replay(multi, 'pulse')
        replay(luck, 'pulse')
        showBanner(`REBIRTH ${state.rebirths}!`, `x${state.multiplier} POWER  ${state.luck}% LUCK`)
      } else {
        sound.deny()
        replay(win.querySelector('.bar'), 'no')
      }
      return
    }
    if (go === 'skip') {
      // Robux sales arrive with the Store; this keeps the player's Strength then.
      sound.deny()
      toast('Robux purchases are coming soon')
      return
    }
    if (go === 'fuse') {
      onFuse()
      return
    }
    if (go.startsWith('rbx:')) {
      sound.deny()
      toast('Robux purchases are coming soon')
      return
    }
    if (go === 'claim') {
      const g = claimDaily()
      if (g) {
        sound.victory()
        flashK = 0.5
        showBanner(`DAY ${((state.dailyDay - 1) % DAILY.length) + 1} CLAIMED!`, g.kind === 'powerMult' ? 'x5 POWER FOREVER' : g.text)
      }
    } else if (buyUpgrade(go)) sound.buy()
    else {
      sound.deny()
      back.querySelector(`[data-go="${go}"]`)?.classList.add('no')
    }
    if (current) render(current)
  })

  // Floaters.
  const floats = []
  function floater(pos, text, color) {
    const e = el('div', 'hud-float', text)
    if (color) e.style.color = color
    root.appendChild(e)
    floats.push({ e, p: pos.clone(), age: 0, dx: (Math.random() - 0.5) * 40 })
  }

  let toastTimer = 0
  function toast(text) {
    toastEl.textContent = text
    toastEl.classList.add('on')
    clearTimeout(toastTimer)
    toastTimer = setTimeout(() => toastEl.classList.remove('on'), 2600)
  }

  let bannerTimer = 0
  function showBanner(h, p, ms = 3200) {
    banner.firstChild.textContent = h
    banner.lastChild.textContent = p
    banner.classList.add('on')
    clearTimeout(bannerTimer)
    bannerTimer = setTimeout(() => banner.classList.remove('on'), ms)
  }

  let flashK = 0
  let gains = 0
  let promptPos = null
  let dailyShown = ''

  return {
    openWindow,
    openFuse(info) {
      fuseInfo = info
      openWindow('fuse')
    },
    closeWindow,
    windowOpen: () => current !== null,
    railCap,
    floater,
    toast,
    showBanner,
    flash(k) {
      flashK = Math.max(flashK, k)
    },
    showDrop(on) {
      drop.classList.toggle('on', on)
    },
    showStop(on) {
      stopBtn.classList.toggle('on', on)
    },
    pulsePower() {
      replay(power, 'pulse')
    },
    // A rep's "+12": it pops up somewhere around the player, then flies into the Strength stat.
    gainFloat(n) {
      if (gains >= 14) return
      gains++
      const e = el('div', 'hud-gain st', `<span>+${compact(n)}</span>${I.bicep('#ffc22e', '#ff7a12')}`)
      root.appendChild(e)
      const w = window.innerWidth
      const h = window.innerHeight
      const r = power.getBoundingClientRect()
      const side = Math.random() < 0.5 ? -1 : 1
      const sx = w * (0.5 + side * (0.1 + Math.random() * 0.2))
      const sy = h * (0.3 + Math.random() * 0.36)
      const a = e.animate(
        [
          { transform: `translate(calc(${sx}px - 50%), ${sy}px) scale(0.3)`, opacity: 0, offset: 0 },
          { transform: `translate(calc(${sx}px - 50%), ${sy - 14}px) scale(1.15)`, opacity: 1, offset: 0.14 },
          { transform: `translate(calc(${sx}px - 50%), ${sy - 24}px) scale(1)`, opacity: 1, offset: 0.6 },
          { transform: `translate(${r.left}px, ${r.top}px) scale(0.42)`, opacity: 0.85, offset: 1 },
        ],
        { duration: 1500, easing: 'ease-in', fill: 'forwards' },
      )
      a.onfinish = () => {
        e.remove()
        gains--
      }
    },
    showPrompt(target, hold) {
      if (!target) {
        if (promptPos) {
          promptPos = null
          prompt.classList.remove('on', 'holding')
        }
        return
      }
      promptPos = target
      prompt.classList.add('on')
      prompt.classList.toggle('holding', hold > 0)
      if (promptText.textContent !== target.text) promptText.textContent = target.text
      ringFg.setAttribute('stroke-dasharray', `${hold * 100} 100`)
    },
    setNext(spec, doubled) {
      barWrap.style.display = timer.style.display = 'none'
      next.style.display = ''
      nextName.textContent = spec.name
      nextX2.style.display = doubled ? '' : 'none'
      top.style.setProperty('--c1', spec.text[0])
      top.style.setProperty('--c2', spec.text[1])
    },
    setCountdown(text, seconds, colors) {
      barWrap.style.display = next.style.display = 'none'
      timer.style.display = ''
      title.textContent = text
      secs.textContent = `${Math.ceil(seconds)} SECONDS`
      top.style.setProperty('--c1', colors[0])
      top.style.setProperty('--c2', colors[1])
    },
    showTrain(spec, hp, reward = spec.reward) {
      timer.style.display = next.style.display = 'none'
      barWrap.style.display = ''
      nameEl.textContent = `${spec.name} TRAIN`
      rewardEl.textContent = compact(reward)
      this.setTrainHp(hp, spec.hp, false)
    },
    setTrainHp(hp, max, hit = true) {
      fill.style.width = `${Math.max(0, (hp / max) * 100)}%`
      hpText.textContent = `${compact(hp)} HP`
      if (hit) replay(bar, 'hit')
    },
    // Coins flying up to the counter.
    coinBurst(n) {
      const r = coins.getBoundingClientRect()
      for (let i = 0; i < n; i++) {
        const e = el('div', 'hud-coinfly', I.coin)
        root.appendChild(e)
        const sx = window.innerWidth / 2 + (Math.random() - 0.5) * 300
        const sy = window.innerHeight * (0.4 + Math.random() * 0.2)
        e.animate(
          [
            { transform: `translate(${sx}px,${sy}px) scale(0.4)`, opacity: 0 },
            { transform: `translate(${sx + (Math.random() - 0.5) * 120}px,${sy - 90}px) scale(1.2)`, opacity: 1, offset: 0.25 },
            { transform: `translate(${r.left + 10}px,${r.top + 10}px) scale(0.6)`, opacity: 0.9 },
          ],
          { duration: 800 + i * 34, easing: 'cubic-bezier(0.5,0,0.8,0.6)' },
        ).onfinish = () => e.remove()
      }
    },
    update(dt, camera) {
      const w = window.innerWidth
      const h = window.innerHeight
      const project = (p) => {
        v3.copy(p).project(camera)
        return [(v3.x * 0.5 + 0.5) * w, (-v3.y * 0.5 + 0.5) * h, v3.z < 1]
      }
      for (let i = floats.length - 1; i >= 0; i--) {
        const f = floats[i]
        f.age += dt
        f.p.y += dt * 2.6
        const [x, y, on] = project(f.p)
        const k = f.age / 1.5
        if (k >= 1) {
          f.e.remove()
          floats.splice(i, 1)
          continue
        }
        f.e.style.opacity = on ? String(1 - k * k) : '0'
        f.e.style.transform = `translate(calc(${x + f.dx}px - 50%), ${y}px) scale(${1 + Math.min(1, f.age * 8) * 0.3 - k * 0.2})`
      }
      if (promptPos) {
        v3.set(promptPos.x, promptPos.y, promptPos.z)
        const [x, y, on] = project(v3)
        prompt.style.transform = `translate(calc(${Math.max(70, Math.min(w - 70, x))}px - 50%), calc(${Math.max(40, Math.min(h - 40, y))}px - 50%))`
        prompt.style.visibility = on ? 'visible' : 'hidden'
      }
      if (flashK > 0) {
        flashK = Math.max(0, flashK - dt * 2.6)
        flash.style.opacity = flashK.toFixed(3)
      }
      const dl = dailyLeft()
      if (current === 'daily') {
        if (dl <= 0 !== dailyReady) render('daily')
        else if (!dailyReady) {
          const n = win.querySelector('.next')
          if (n) n.textContent = `Next Gift in ${hms(dl)}`
        }
      }
      const text = dl > 0 ? clock(dl) : 'CLAIM!'
      if (text !== dailyShown) {
        dailyShown = text
        dailyLabel.textContent = text
      }
    },
  }
}
