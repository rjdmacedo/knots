# i18n Translations: Friend Timeline

Add keys under `"Friends"` in each locale file. Merge into the existing `"Friends"` object — do not replace other keys.

**All 19 locale files must be updated.**

Files: `en-US`, `pt-PT`, `pt-BR`, `es`, `ca`, `de-DE`, `fr-FR`, `it-IT`, `nl-NL`, `pl-PL`, `cs-CZ`, `ro`, `ru-RU`, `ua-UA`, `tr-TR`, `fi`, `ja-JP`, `zh-CN`, `zh-TW`.

---

## en-US (source of truth)

```json
"List": {
  "totalOwedToYou": "In total, you are owed {amount}",
  "totalYouOwe": "In total, you owe {amount}",
  "totalOwedToYouMulti": "In total, you are owed",
  "totalYouOweMulti": "In total, you owe",
  "showSettledFriends": "Show {count} settled friends",
  "hideSettledFriends": "Hide settled friends",
  "noUnsettledFriends": "You're all settled up with everyone.",
  "debtSectionTitle": "Balances",
  "manageSectionTitle": "All friends"
},
"Timeline": {
  "addExpense": "Add expense",
  "empty": "No activity with this friend yet.",
  "loadError": "Could not load timeline.",
  "retry": "Retry",
  "groupSettled": "All settled up",
  "groupShared": "Shared group",
  "youLent": "you lent {amount}",
  "youBorrowed": "you borrowed {amount}",
  "friendOwesYou": "{name} owes you {amount}",
  "youOweFriend": "You owe {name} {amount}",
  "paid": "{payer} paid {payee} {amount}",
  "groups": {
    "upcoming": "Upcoming",
    "thisWeek": "This week",
    "earlierThisMonth": "Earlier this month",
    "lastMonth": "Last month",
    "earlierThisYear": "Earlier this year",
    "lastYear": "Last year",
    "older": "Older"
  }
},
"PaymentDetail": {
  "title": "Payment",
  "paid": "{payer} paid {payee}",
  "addedBy": "Added by {name} on {date}",
  "disclaimer": "This payment was recorded using \"Record a payment\". No money was transferred.",
  "edit": "Edit",
  "delete": "Delete",
  "deleteConfirm": "Delete this payment?",
  "deleteDescription": "This will adjust balances as if the payment never happened.",
  "notFound": "Payment not found.",
  "backToFriend": "Back to {name}"
},
"DirectExpense": {
  "title": "Add an expense",
  "description": "With {name}",
  "descriptionLabel": "Description",
  "descriptionPlaceholder": "Enter a description",
  "amountLabel": "Amount",
  "paidByLabel": "Paid by",
  "paidByYou": "You",
  "splitEqually": "Paid by {payer} and split equally",
  "dateLabel": "Date",
  "save": "Save",
  "saving": "Saving…",
  "cancel": "Cancel",
  "success": "Expense added.",
  "error": "Could not add expense."
},
"SettleAll": {
  "button": "Settle all",
  "title": "Settle all balances",
  "description": "This will settle all your balances with {name} in {currency}.",
  "breakdown": "Breakdown",
  "directBucket": "Direct",
  "confirm": "Settle all",
  "settling": "Settling…",
  "success": "All balances settled.",
  "error": "Could not settle balances.",
  "timelineLabel": "Settled all balances — {amount}",
  "consolidationDisclaimer": "This payment is part of a full balance settlement. Knots decomposed it into individual settlements per group.",
  "onlyOneBucket": "Only one balance bucket — use per-group settle instead."
}
```

---

## pt-PT

```json
"List": {
  "totalOwedToYou": "No total, devem-lhe {amount}",
  "totalYouOwe": "No total, deve {amount}",
  "totalOwedToYouMulti": "No total, devem-lhe",
  "totalYouOweMulti": "No total, deve",
  "showSettledFriends": "Mostrar {count} amigos com contas liquidadas",
  "hideSettledFriends": "Ocultar amigos com contas liquidadas",
  "noUnsettledFriends": "Está acertado com todos.",
  "debtSectionTitle": "Saldos",
  "manageSectionTitle": "Todos os amigos"
},
"Timeline": {
  "addExpense": "Adicionar despesa",
  "empty": "Ainda não há actividade com este amigo.",
  "loadError": "Não foi possível carregar a cronologia.",
  "retry": "Tentar novamente",
  "groupSettled": "Contas liquidadas",
  "groupShared": "Grupo partilhado",
  "youLent": "emprestou {amount}",
  "youBorrowed": "deve {amount}",
  "friendOwesYou": "{name} deve-lhe {amount}",
  "youOweFriend": "Deve {amount} a {name}",
  "paid": "{payer} pagou {payee} {amount}",
  "groups": {
    "upcoming": "Próximas",
    "thisWeek": "Esta semana",
    "earlierThisMonth": "Anteriormente este mês",
    "lastMonth": "Mês passado",
    "earlierThisYear": "Anteriormente este ano",
    "lastYear": "Ano passado",
    "older": "Mais antigas"
  }
},
"PaymentDetail": {
  "title": "Pagamento",
  "paid": "{payer} pagou {payee}",
  "addedBy": "Adicionado por {name} em {date}",
  "disclaimer": "Este pagamento foi adicionado utilizando a funcionalidade \"Registar um pagamento\". Não foi transferido dinheiro.",
  "edit": "Editar",
  "delete": "Eliminar",
  "deleteConfirm": "Eliminar este pagamento?",
  "deleteDescription": "Isto ajustará os saldos como se o pagamento nunca tivesse acontecido.",
  "notFound": "Pagamento não encontrado.",
  "backToFriend": "Voltar a {name}"
},
"DirectExpense": {
  "title": "Adicionar uma despesa",
  "description": "Com {name}",
  "descriptionLabel": "Descrição",
  "descriptionPlaceholder": "Insira a descrição",
  "amountLabel": "Valor",
  "paidByLabel": "Pago por",
  "paidByYou": "Si",
  "splitEqually": "Pago por {payer} e dividido em partes iguais",
  "dateLabel": "Data",
  "save": "Guardar",
  "saving": "A guardar…",
  "cancel": "Cancelar",
  "success": "Despesa adicionada.",
  "error": "Não foi possível adicionar a despesa."
},
"SettleAll": {
  "button": "Liquidar tudo",
  "title": "Liquidar todos os saldos",
  "description": "Isto liquidará todos os saldos com {name} em {currency}.",
  "breakdown": "Detalhes",
  "directBucket": "Direto",
  "confirm": "Liquidar tudo",
  "settling": "A liquidar…",
  "success": "Todos os saldos foram liquidados.",
  "error": "Não foi possível liquidar os saldos.",
  "timelineLabel": "Liquidou todos os saldos — {amount}",
  "consolidationDisclaimer": "Este pagamento faz parte de uma liquidação total de saldos. O Knots desagregou-o em liquidações individuais por grupo.",
  "onlyOneBucket": "Apenas um saldo pendente — utilize a liquidação por grupo."
}
```

---

## Other locales

For each of the remaining 17 locale files, translate all keys above following the same structure. Use natural Splitwise-equivalent terms where they exist in each language.

Minimum keys that MUST be translated (not left in English):

- `Friends.List.*`
- `Friends.Timeline.*`
- `Friends.PaymentDetail.*`
- `Friends.DirectExpense.*`
- `Friends.SettleAll.*`

Reuse existing `Friends.Balances` keys where copy overlaps (`settled`, `friendOwesYou`, `youOweFriend`).

---

## Namespace placement

Merge under the existing `"Friends"` object in each `messages/{locale}.json`:

```json
{
  "Friends": {
    "...existing keys...",
    "List": { },
    "Timeline": { },
    "PaymentDetail": { },
    "DirectExpense": { }
  }
}
```

Do **not** remove existing `Friends.Expenses` or `Friends.BalanceDetail` keys until redirects are shipped — mark deprecated in comments only if needed.
