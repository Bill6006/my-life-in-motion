export type Anchor = 0 | 1 | 2 | 3 | 4
export const readings = {
  mood: { label: 'Mood', prompt: 'What is the emotional tone right now?', anchors: ['Heavy — ordinary things feel hard', 'Low — little feels appealing', 'Flat — nothing wrong, nothing good', 'Settled — mostly at ease', 'Bright — enjoying being here'] },
  irritation: { label: 'Irritation', prompt: 'How easily are things getting under your skin?', anchors: ['Unruffled — little is getting to me', 'A little prickly — small things catch me', 'On edge — annoyances are hard to shake', 'Very touchy — small things feel big', 'At boiling point — almost anything sets me off'] },
  stress: { label: 'Stress', prompt: 'How much pressure do you feel?', anchors: ['Unpressured — I can breathe easily', 'Some pressure — it comes and goes', 'Tense — pressure stays in the background', 'Under strain — it is hard to settle', 'Intense pressure — it fills my attention'] },
  overwhelm: { label: 'Overwhelm', prompt: 'How manageable does what is in front of you feel?', anchors: ['Manageable — I can see what comes next', 'A little crowded — I can still sort things', 'Pulled apart — choosing a next step takes work', 'Too much at once — I cannot find a starting point', 'Flooded — even one next step feels too much'] },
  motivation: { label: 'Motivation', prompt: 'How much pull do you feel to begin something?', anchors: ['No pull — starting holds no appeal', 'A faint pull — I would rather leave it', 'Some pull — a small start appeals', 'Drawn in — I want to get going', 'Eager — I am looking forward to starting'] },
  confidence: { label: 'Confidence', prompt: 'How capable do you feel of handling what comes next?', anchors: ['Doubting — I do not trust my ability right now', 'Unsure — I expect to need reassurance', 'Mixed — I trust myself with familiar things', 'Capable — I think I can handle this', 'Self-assured — I trust myself with uncertainty'] },
  focus: { label: 'Focus', prompt: 'How available is your attention?', anchors: ['Scattered — I cannot stay with one thing', 'Drifting — I lose the thread quickly', 'Patchy — I can focus in short stretches', 'Attentive — I can stay with a task', 'Clear — my attention stays where I put it'] },
  loneliness: { label: 'Loneliness', prompt: 'How much are you missing connection?', anchors: ['Connected — I have the closeness I want', 'A little apart — some company would be welcome', 'Missing connection — I wish someone were here', 'Very alone — the distance feels painful', 'Deeply isolated — I feel cut off from others'] },
  socialEnergy: { label: 'Social energy', prompt: 'How much room do you have for interaction?', anchors: ['No room — I need time without interaction', 'Very little room — a brief hello is enough', 'Some room — a short conversation fits', 'Open — I have energy for company', 'Plenty of room — I feel ready to engage'] },
  energy: { label: 'Energy', prompt: 'How much usable energy is in your body?', anchors: ['Drained — even small actions take effort', 'Low fuel — I can manage the essentials', 'Some fuel — I can do a little more', 'Energised — I have room to be active', 'Full of energy — movement feels easy'] },
  hunger: { label: 'Hunger', prompt: 'What is your body saying about food?', anchors: ['Overfull — eating more feels uncomfortable', 'Satisfied — I do not want food yet', 'Ready to eat — hunger is starting', 'Very hungry — food keeps drawing my attention', 'Urgently hungry — waiting feels difficult'] },
  sleepHours: { label: 'Sleep hours', prompt: 'About how much did you sleep last night?', anchors: ['A short night — under 4 hours', 'A brief night — 4 to under 6 hours', 'A mid-length night — 6 to under 7 hours', 'A longer night — 7 to under 9 hours', 'An extended night — 9 hours or more'] },
  sleepQuality: { label: 'Sleep quality', prompt: 'How did that sleep feel?', anchors: ['Unrestful — I feel barely restored', 'Broken — I woke often and feel unrested', 'Mixed — some rest, some disruption', 'Restful — I woke mostly restored', 'Deeply restful — I woke refreshed'] },
} as const
export type ReadingId = keyof typeof readings
export type Answers = Partial<Record<ReadingId, Anchor>>
export type WindowName = 'morning' | 'afternoon' | 'evening'
export const core = ['mood', 'energy', 'focus', 'stress', 'overwhelm', 'irritation'] as const
export const contextIds = ['hunger', 'sleepHours', 'sleepQuality', 'confidence', 'loneliness', 'socialEnergy', 'motivation'] as const
export const windowReadings: Record<WindowName, readonly ReadingId[]> = {
  morning: ['mood', 'irritation', 'stress', 'overwhelm', 'motivation', 'confidence', 'focus', 'loneliness', 'socialEnergy', 'energy', 'hunger', 'sleepHours', 'sleepQuality'],
  afternoon: ['mood', 'irritation', 'energy', 'hunger', 'stress', 'focus', 'overwhelm'],
  evening: ['mood', 'irritation', 'energy', 'hunger', 'stress', 'focus', 'overwhelm'],
}
export const bands = [['0–19', 'Low reserve'], ['20–39', 'Stretched'], ['40–59', 'Mixed'], ['60–79', 'Steady'], ['80–100', 'Plenty in reserve']] as const
export function calculateScore(answers: Answers): number | undefined {
  if (core.some(id => !Number.isInteger(answers[id]) || answers[id]! < 0 || answers[id]! > 4)) return undefined
  return core.reduce((sum, id) => sum + (['stress', 'overwhelm', 'irritation'].includes(id) ? 4 - answers[id]! : answers[id]!) * 25, 0) / 6
}
export function scoreWord(score: number) { return bands[Math.min(4, Math.floor(Math.round(score) / 20))][1] }
export function currentWindow(date = new Date()): WindowName { return date.getHours() < 12 ? 'morning' : date.getHours() < 18 ? 'afternoon' : 'evening' }
export function localDay(date = new Date()): string { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` }
export function dateLabel(iso: string) { return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(iso)) }
export function titleCase(value: string) { return value[0].toUpperCase() + value.slice(1) }
