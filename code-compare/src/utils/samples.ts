export const SAMPLE_ORIGINAL = `function formatPrice(amount, currency) {
  var value = amount / 100
  return currency + value.toFixed(2)
}

function total(items) {
  var sum = 0
  for (var i = 0; i < items.length; i++) {
    sum += items[i].price
  }
  return sum
}
`

export const SAMPLE_MODIFIED = `function formatPrice(amount: number, currency = 'CNY'): string {
  const value = amount / 100
  return new Intl.NumberFormat('zh-CN', { style: 'currency', currency }).format(value)
}

function total(items: { price: number }[]): number {
  return items.reduce((sum, item) => sum + item.price, 0)
}

export { formatPrice, total }
`
