import { GOALS } from './config.js'
import { parkHp, sizeTrain } from './fair.js'
import { addCoins, compact, state as progress, upgradeLevel } from './progress.js'

// Session goals: three small goals at a time (GOALS), counted here and drawn by the HUD. Not saved:
// every page load starts with the first set; a finished set comes back with bigger targets.
// add('stop' | 'park' | 'train', n) counts toward them.
export function createGoals(hud, sound) {
  let round = 0
  let list = []

  // A goal pays a share of what a train sized to this player would.
  const coinsFor = () => Math.max(GOALS.minCoins, Math.round(sizeTrain(parkHp(progress.power, upgradeLevel('carry')), 0, 1).reward * GOALS.pay))
  const label = (g) => g.text.replace('{n}', compact(g.target))
  const shown = (g) => Math.floor(g.have / (g.unit ?? 1))

  function show() {
    hud.setGoals(
      list.map((g) => ({ text: label(g), have: shown(g), target: g.target, done: g.done })),
      round + 1,
    )
  }

  function deal() {
    const k = GOALS.grow ** round
    list = GOALS.set.map((g) => ({ ...g, target: Math.round(g.n * k), have: 0, done: false }))
    show()
  }

  function add(id, n = 1) {
    const g = list.find((x) => x.id === id)
    if (!g || g.done) return
    const before = shown(g)
    g.have = Math.min(g.target * (g.unit ?? 1), g.have + n)
    if (g.have >= g.target * (g.unit ?? 1)) {
      g.done = true
      const coins = coinsFor()
      addCoins(coins)
      sound.buy()
      hud.toast(`GOAL DONE: ${label(g)}! +${compact(coins)} COINS`)
      if (list.every((x) => x.done)) {
        const bonus = coins * GOALS.bonus
        addCoins(bonus)
        round += 1
        setTimeout(() => {
          sound.victory()
          hud.coinBurst(16)
          hud.showBanner('ALL GOALS DONE!', `+${compact(bonus)} BONUS COINS · NEW GOALS!`, 3600)
          deal()
        }, 2200)
      }
      show()
    } else if (shown(g) !== before) show()
  }

  deal()
  return { add }
}
