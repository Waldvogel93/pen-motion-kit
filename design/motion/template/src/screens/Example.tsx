import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { R } from '@/motion/roles'

export default function Example() {
  return (
    <R.Screen>
      <main className="mx-auto flex max-w-3xl flex-col gap-6 p-8">
        <R.Item>
          <h1 className="text-3xl font-semibold">Пример экрана</h1>
        </R.Item>
        <R.Item>
          <R.Button element="Действие">
            <Button>Действие</Button>
          </R.Button>
        </R.Item>
        <div className="grid gap-4 sm:grid-cols-2">
          <R.Item className="grid">
            <R.Card element="Первая карточка">
              <Card>
                <CardHeader>
                  <CardTitle>Первая карточка</CardTitle>
                  <CardDescription>Короткое описание</CardDescription>
                </CardHeader>
                <CardContent>Содержимое карточки.</CardContent>
              </Card>
            </R.Card>
          </R.Item>
          <R.Item className="grid">
            <R.Card element="Вторая карточка">
              <Card>
                <CardHeader>
                  <CardTitle>Вторая карточка</CardTitle>
                  <CardDescription>Ещё одно описание</CardDescription>
                </CardHeader>
                <CardContent>Содержимое карточки.</CardContent>
              </Card>
            </R.Card>
          </R.Item>
        </div>
      </main>
    </R.Screen>
  )
}
