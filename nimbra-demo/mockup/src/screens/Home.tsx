// Экран «Home» — рамка Home в design/nimbra-demo.pen (кит shadcn Obra). Раскладка — по выгрузке рамки,
// element у обёрток R.* — имена слоёв pen.dev буква в букву.
import { ChartPie, CircleCheck, createLucideIcon, Receipt, Wallet, Wifi, type LucideIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { R } from '@/motion/roles'

// credit-card как в наборе lucide у pen.dev: карта с полосой. В lucide-react 1.x к ней добавлен штрих «M6 14h2».
const CreditCard = createLucideIcon('credit-card', [
  ['rect', { width: '20', height: '14', x: '2', y: '5', rx: '2', key: 'card' }],
  ['line', { x1: '2', x2: '22', y1: '10', y2: '10', key: 'stripe' }],
])

const NAV_LINKS = ['Возможности', 'Тарифы', 'Безопасность']

const FEATURES: { name: string; icon: LucideIcon; text: string }[] = [
  { name: 'Карты', icon: CreditCard, text: 'Виртуальная карта под каждую задачу — за пару минут, с лимитом и сроком.' },
  { name: 'Бюджеты', icon: ChartPie, text: 'Лимиты по отделам и проектам. Остаток виден сразу после каждой покупки.' },
  { name: 'Согласования', icon: CircleCheck, text: 'Заявка на расход приходит руководителю, решение — одним нажатием.' },
]

// Значение статистики — число в своём R.Number, остальное («мин», «−», «%», «нажатие») снаружи.
const STATS = [
  { before: '', value: 2, after: ' мин', label: 'на выпуск новой карты' },
  { before: '−', value: 28, after: '%', label: 'незапланированных трат за квартал' },
  { before: '', value: 1, after: ' нажатие', label: 'чтобы согласовать заявку' },
]

export default function Home() {
  return (
    <R.Screen>
      <div className="flex w-full flex-col bg-background text-foreground">
        <R.Item>
          <header className="flex items-center justify-between px-20 py-5 shadow-[inset_0_-1px_0_var(--color-border)]">
            <div className="flex items-center gap-2.5">
              <div className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <Wallet className="size-4" />
              </div>
              <span className="text-lg leading-[normal] font-semibold">Nimbra</span>
            </div>
            <nav className="flex items-center gap-1">
              {NAV_LINKS.map((label) => (
                <R.NavLink key={label} element={`Nav ${label}`}>
                  <Button variant="ghost" type="button">
                    {label}
                  </Button>
                </R.NavLink>
              ))}
            </nav>
            <div className="flex items-center gap-2">
              <R.Button element="Sign In">
                <Button variant="ghost" asChild>
                  <a href="#/Login">Войти</a>
                </Button>
              </R.Button>
              <R.Button element="Get Started">
                <Button asChild>
                  <a href="#/Login">Попробовать</a>
                </Button>
              </R.Button>
            </div>
          </header>
        </R.Item>

        <main className="flex flex-col">
          <R.Ambient element="Hero">
            <section className="relative isolate flex items-center justify-between gap-12 px-20 pt-28 pb-20">
              <div className="flex min-w-0 flex-1 flex-col items-start gap-7">
                <R.Item className="flex">
                  <Badge variant="secondary">Финансы команды</Badge>
                </R.Item>
                {/* Три строки заголовка — как переносится в рамке на 1440. «под контролем» — акцент из двух кусков. */}
                <h1 className="w-full text-[56px] leading-[59px] font-semibold tracking-[-1.5px]">
                  <R.Item>
                    Траты команды{' '}
                    <R.Ambient element="Headline Accent" index={0}>
                      <span>под</span>
                    </R.Ambient>
                  </R.Item>
                  <R.Item>
                    <R.Ambient element="Headline Accent" index={1}>
                      <span>контролем</span>
                    </R.Ambient>{' '}
                    — без таблиц и
                  </R.Item>
                  <R.Item>пересылок</R.Item>
                </h1>
                <R.Item>
                  <p className="w-[560px] text-lg leading-[27px] text-muted-foreground">
                    Корпоративные карты, бюджеты отделов и согласование расходов в одном месте. Руководитель видит каждую
                    трату, бухгалтерия — готовые отчёты.
                  </p>
                </R.Item>
                <R.Item>
                  <div className="flex items-center gap-3">
                    <R.Button element="Primary CTA">
                      <Button asChild>
                        <a href="#/Login">Начать бесплатно</a>
                      </Button>
                    </R.Button>
                    <R.Button element="Secondary CTA">
                      <Button variant="outline" asChild>
                        <a href="#/Login">Войти в кабинет</a>
                      </Button>
                    </R.Button>
                  </div>
                </R.Item>
              </div>

              <R.Item className="w-[420px] shrink-0">
                <div className="flex w-full flex-col gap-4">
                  <R.Ambient element="Company Card">
                    <div className="flex h-60 w-full flex-col justify-between rounded-[16px] bg-primary p-6 text-primary-foreground">
                      <div className="flex items-center justify-between">
                        <span className="text-[15px] leading-[normal] font-medium">Маркетинг</span>
                        <Wifi className="size-[18px] rotate-90" aria-hidden />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <span className="text-[22px] leading-[normal] font-medium tracking-[2px]">•••• 4021</span>
                        <span className="text-[13px] leading-[normal] text-[#a3a3a3]">
                          Лимит 150 000 ₽ · осталось 62 400 ₽
                        </span>
                      </div>
                    </div>
                  </R.Ambient>
                  <div className="flex w-full items-center gap-3 rounded-[12px] bg-background px-4 py-3.5 outline outline-border outline-offset-[-0.5px]">
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-secondary">
                      <Receipt className="size-4" aria-hidden />
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="text-sm leading-[normal] font-medium">Figma, годовая подписка</span>
                      <span className="text-[13px] leading-[normal] text-muted-foreground">12 400 ₽ · Анна Петрова</span>
                    </div>
                    <Badge>Согласовано</Badge>
                  </div>
                </div>
              </R.Item>
            </section>
          </R.Ambient>

          <section className="flex items-start gap-5 px-20 pb-24">
            {FEATURES.map(({ name, icon: Icon, text }) => (
              <R.Item key={name} className="flex min-w-0 flex-1">
                <R.Card element={`Feature ${name}`}>
                  <Card className="flex-1">
                    <CardContent className="flex flex-col gap-3">
                      <div className="flex size-9 items-center justify-center rounded-lg bg-secondary">
                        <Icon className="size-[18px]" aria-hidden />
                      </div>
                      <h2 className="text-lg leading-[normal] font-semibold">{name}</h2>
                      <p className="text-sm leading-[21px] text-muted-foreground">{text}</p>
                    </CardContent>
                  </Card>
                </R.Card>
              </R.Item>
            ))}
          </section>

          <R.Item>
            <section className="flex items-start gap-5 bg-muted px-20 py-12">
              {STATS.map(({ before, value, after, label }) => (
                <div key={label} className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <span className="text-[40px] leading-[normal] font-semibold tracking-[-1px]">
                    {before}
                    <R.Number element="Stat Value" value={value}>
                      <span>{value}</span>
                    </R.Number>
                    {after}
                  </span>
                  <span className="text-sm leading-[normal] text-muted-foreground">{label}</span>
                </div>
              ))}
            </section>
          </R.Item>
        </main>

        <R.Item>
          <footer className="flex items-center justify-between px-20 py-7 text-[13px] leading-[normal] text-muted-foreground">
            <span>© 2026 Nimbra</span>
            <span>Демо-продукт для проверки живого макета</span>
          </footer>
        </R.Item>
      </div>
    </R.Screen>
  )
}
