// Экран «Login» — рамки Login, Login / code и Login / error в design/nimbra-demo.pen (кит shadcn Obra).
// Один экран со своим шагом: почта → (загрузка) → код. Нарисованные состояния — тот же компонент,
// открытый сразу в нужном шаге (LoginCode, LoginError). element у обёрток R.* — имена слоёв pen.dev.
import { REGEXP_ONLY_DIGITS } from 'input-otp'
import { Wallet } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp'
import { Label } from '@/components/ui/label'
import { R } from '@/motion/roles'

type Step = 'email' | 'code'
type Verdict = 'idle' | 'error' | 'success'

// Логика демо: бэкенда нет, верный код один.
const CODE_LENGTH = 6
const DEMO_CODE = '204815'
const SEND_MS = 700 // «Получить код» → шаг кода
const VERIFY_MS = 300 // последняя цифра успевает встать, потом приговор
const SUCCESS_MS = 900 // «Готово» видно, потом главная

export default function Login({
  initialStep = 'email',
  initialCode = '',
  forceError = false,
}: {
  initialStep?: Step
  initialCode?: string
  forceError?: boolean
}) {
  const [step, setStep] = useState<Step>(initialStep)
  const [email, setEmail] = useState('anna@company.ru')
  const [sending, setSending] = useState(false)
  const [code, setCode] = useState(initialCode)
  const [verdict, setVerdict] = useState<Verdict>(forceError ? 'error' : 'idle')

  useEffect(() => {
    if (!sending) return
    const timer = window.setTimeout(() => {
      setSending(false)
      setCode('')
      setVerdict('idle')
      setStep('code')
    }, SEND_MS)
    return () => window.clearTimeout(timer)
  }, [sending])

  useEffect(() => {
    if (step !== 'code' || code.length < CODE_LENGTH || verdict !== 'idle') return
    const timer = window.setTimeout(() => setVerdict(code === DEMO_CODE ? 'success' : 'error'), VERIFY_MS)
    return () => window.clearTimeout(timer)
  }, [step, code, verdict])

  useEffect(() => {
    if (verdict !== 'success') return
    const timer = window.setTimeout(() => {
      window.location.hash = '#/Home'
    }, SUCCESS_MS)
    return () => window.clearTimeout(timer)
  }, [verdict])

  const sendCode = (e: FormEvent) => {
    e.preventDefault()
    if (!sending) setSending(true)
  }

  const typeCode = (next: string) => {
    setCode(next)
    setVerdict('idle') // ввод после ошибки сбрасывает ошибку
  }

  const signIn = (e: FormEvent) => {
    e.preventDefault()
    if (code.length === CODE_LENGTH && verdict === 'idle') setVerdict(code === DEMO_CODE ? 'success' : 'error')
  }

  const changeEmail = () => {
    setStep('email')
    setCode('')
    setVerdict('idle')
  }

  const error = verdict === 'error'

  return (
    <R.Screen>
      <div className="flex min-h-svh w-full flex-col bg-background text-foreground">
        <R.Item>
          <div className="flex px-6 py-5">
            <R.Button element="Back Home">
              <Button variant="ghost" asChild>
                <a href="#/Home">← На главную</a>
              </Button>
            </R.Button>
          </div>
        </R.Item>

        <div className="flex flex-1 items-center justify-center pb-[72px]">
          {/* Колонка шага — своё появление: при смене шага R.Screen с key пересоздаётся, и блоки нового
              шага выезжают из-под масок каскадом (одиночный R.Item, добавленный позже, выезжает сам, без каскада). */}
          <R.Screen key={step}>
            <div className="flex w-[360px] flex-col items-center gap-6">
              <R.Item>
                <div className="flex size-10 items-center justify-center rounded-[10px] bg-primary text-primary-foreground">
                  <Wallet className="size-5" aria-hidden />
                </div>
              </R.Item>

              <R.Item className="w-full">
                <div className="flex w-full flex-col items-center gap-2">
                  <h1 className="text-2xl leading-[normal] font-semibold tracking-[-0.4px]">
                    {step === 'email' ? 'Вход в Nimbra' : 'Проверьте почту'}
                  </h1>
                  <p className="w-full text-center text-sm leading-[21px] text-muted-foreground">
                    {step === 'email'
                      ? 'Введите рабочую почту — пришлём код для входа'
                      : `Отправили шестизначный код на ${email}`}
                  </p>
                </div>
              </R.Item>

              {step === 'email' ? (
                <form className="contents" onSubmit={sendCode}>
                  <R.Item className="w-full">
                    <div className="flex w-full flex-col gap-2">
                      <Label htmlFor="login-email" className="h-[21px] items-start leading-5">
                        Рабочая почта
                      </Label>
                      <R.Input element="Email">
                        <Input
                          id="login-email"
                          type="email"
                          autoComplete="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                        />
                      </R.Input>
                    </div>
                  </R.Item>
                  <R.Item className="w-full">
                    <R.Button element="Get Code" state={sending ? 'loading' : 'idle'}>
                      <Button type="submit" className="w-full" aria-busy={sending || undefined}>
                        Получить код
                      </Button>
                    </R.Button>
                  </R.Item>
                  <R.Item>
                    <p className="text-[13px] leading-[normal] text-muted-foreground">Нет аккаунта? Попробуйте бесплатно</p>
                  </R.Item>
                </form>
              ) : (
                <form className="contents" onSubmit={signIn}>
                  <R.Item>
                    <div className="flex flex-col items-center gap-2.5">
                      <R.Otp element="OTP" state={verdict}>
                        <div>
                          <InputOTP
                            maxLength={CODE_LENGTH}
                            pattern={REGEXP_ONLY_DIGITS}
                            value={code}
                            onChange={typeCode}
                            autoFocus={!forceError}
                            aria-label="Код из письма"
                            aria-invalid={error || undefined}
                          >
                            <InputOTPGroup>
                              {Array.from({ length: CODE_LENGTH }, (_, i) => (
                                <InputOTPSlot key={i} index={i} className="size-9" aria-invalid={error || undefined} />
                              ))}
                            </InputOTPGroup>
                          </InputOTP>
                        </div>
                      </R.Otp>
                      {error && (
                        <R.Item>
                          <p role="alert" className="text-[13px] leading-[normal] text-destructive">
                            Неверный код. Осталось 2 попытки
                          </p>
                        </R.Item>
                      )}
                    </div>
                  </R.Item>
                  <R.Item className="w-full">
                    <R.Button element="Sign In">
                      <Button type="submit" className="w-full">
                        Войти
                      </Button>
                    </R.Button>
                  </R.Item>
                  <R.Item>
                    <div className="flex flex-col items-center gap-1.5">
                      <p className="text-[13px] leading-[normal] text-muted-foreground">Отправить код повторно через 0:42</p>
                      <R.Button element="Change Email">
                        <Button variant="link" type="button" onClick={changeEmail}>
                          Изменить почту
                        </Button>
                      </R.Button>
                    </div>
                  </R.Item>
                </form>
              )}
            </div>
          </R.Screen>
        </div>
      </div>
    </R.Screen>
  )
}

/** Рамка «Login / code»: введены 4, 8, 1, курсор в четвёртой ячейке. */
export function LoginCode() {
  return <Login initialStep="code" initialCode="481" />
}

/** Рамка «Login / error»: все шесть цифр, неверный код. */
export function LoginError() {
  return <Login initialStep="code" initialCode="481902" forceError />
}
