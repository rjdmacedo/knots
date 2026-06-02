/**
 * Syncs Notifications namespace from patches (aligned with en-US.json).
 * Removes obsolete keys from the old notification UI.
 *
 * Usage: node scripts/sync-notification-messages.mjs
 */
import fs from 'node:fs'
import path from 'node:path'

const MESSAGES_DIR = path.resolve(import.meta.dirname, '../messages')

const OBSOLETE_NOTIFICATION_KEYS = [
  'othersOnly',
  'includeOwnChanges',
  'includeOwnChangesDescription',
  'sharedDeviceLabel',
  'sharedDeviceMember',
]

/** @type {Record<string, Record<string, string>>} */
const NOTIFICATION_PATCHES = {
  ca: {
    filterHint:
      'Tria de qui vols rebre alertes i quins esdeveniments vols rebre.',
    membersLabel: "Notifica'm sobre",
    notifyAllMembers: 'Tothom del grup',
    notifySpecificMembers: 'O només aquests membres:',
    eventsLabel: 'Esdeveniments',
    eventCreate: 'Despesa creada',
    eventUpdate: 'Despesa actualitzada',
    eventDelete: 'Despesa eliminada',
    selectAtLeastOneFilter: 'Selecciona almenys un membre o un esdeveniment.',
  },
  'cs-CZ': {
    filterHint: 'Vyberte, od koho chcete dostávat upozornění a které události.',
    membersLabel: 'Upozornit mě na',
    notifyAllMembers: 'Všichni ve skupině',
    notifySpecificMembers: 'Nebo pouze tito členové:',
    eventsLabel: 'Události',
    eventCreate: 'Výdaj vytvořen',
    eventUpdate: 'Výdaj upraven',
    eventDelete: 'Výdaj smazán',
    selectAtLeastOneFilter: 'Vyberte alespoň jednoho člena nebo událost.',
  },
  'de-DE': {
    filterHint:
      'Wähle, von wem du Benachrichtigungen erhalten möchtest und welche Ereignisse.',
    membersLabel: 'Benachrichtige mich über',
    notifyAllMembers: 'Alle in der Gruppe',
    notifySpecificMembers: 'Oder nur diese Mitglieder:',
    eventsLabel: 'Ereignisse',
    eventCreate: 'Ausgabe erstellt',
    eventUpdate: 'Ausgabe bearbeitet',
    eventDelete: 'Ausgabe gelöscht',
    selectAtLeastOneFilter: 'Wähle mindestens ein Mitglied oder ein Ereignis.',
  },
  es: {
    filterHint: 'Elige de quién quieres alertas y qué eventos recibir.',
    membersLabel: 'Notificarme sobre',
    notifyAllMembers: 'Todos en el grupo',
    notifySpecificMembers: 'O solo estos miembros:',
    eventsLabel: 'Eventos',
    eventCreate: 'Gasto creado',
    eventUpdate: 'Gasto actualizado',
    eventDelete: 'Gasto eliminado',
    selectAtLeastOneFilter: 'Selecciona al menos un miembro o un evento.',
  },
  fi: {
    filterHint: 'Valitse, keneltä haluat ilmoituksia ja mitkä tapahtumat.',
    membersLabel: 'Ilmoita minulle',
    notifyAllMembers: 'Kaikki ryhmässä',
    notifySpecificMembers: 'Tai vain nämä jäsenet:',
    eventsLabel: 'Tapahtumat',
    eventCreate: 'Kulu luotu',
    eventUpdate: 'Kulu päivitetty',
    eventDelete: 'Kulu poistettu',
    selectAtLeastOneFilter: 'Valitse vähintään yksi jäsen tai tapahtuma.',
  },
  'fr-FR': {
    filterHint: 'Choisissez de qui recevoir des alertes et quels événements.',
    membersLabel: 'Me notifier pour',
    notifyAllMembers: 'Tout le monde dans le groupe',
    notifySpecificMembers: 'Ou uniquement ces membres :',
    eventsLabel: 'Événements',
    eventCreate: 'Dépense créée',
    eventUpdate: 'Dépense modifiée',
    eventDelete: 'Dépense supprimée',
    selectAtLeastOneFilter: 'Sélectionnez au moins un membre ou un événement.',
  },
  'it-IT': {
    filterHint: 'Scegli da chi ricevere avvisi e quali eventi ricevere.',
    membersLabel: 'Notificami su',
    notifyAllMembers: 'Tutti nel gruppo',
    notifySpecificMembers: 'O solo questi membri:',
    eventsLabel: 'Eventi',
    eventCreate: 'Spesa creata',
    eventUpdate: 'Spesa aggiornata',
    eventDelete: 'Spesa eliminata',
    selectAtLeastOneFilter: 'Seleziona almeno un membro o un evento.',
  },
  'ja-JP': {
    filterHint: '通知を受け取るメンバーとイベントを選択してください。',
    membersLabel: '通知対象',
    notifyAllMembers: 'グループ全員',
    notifySpecificMembers: 'または次のメンバーのみ：',
    eventsLabel: 'イベント',
    eventCreate: '支出の作成',
    eventUpdate: '支出の更新',
    eventDelete: '支出の削除',
    selectAtLeastOneFilter: 'メンバーまたはイベントを1つ以上選択してください。',
  },
  'nl-NL': {
    filterHint:
      'Kies van wie je meldingen wilt ontvangen en welke gebeurtenissen.',
    membersLabel: 'Stuur mij meldingen over',
    notifyAllMembers: 'Iedereen in de groep',
    notifySpecificMembers: 'Of alleen deze leden:',
    eventsLabel: 'Gebeurtenissen',
    eventCreate: 'Uitgave aangemaakt',
    eventUpdate: 'Uitgave bijgewerkt',
    eventDelete: 'Uitgave verwijderd',
    selectAtLeastOneFilter: 'Selecteer minstens één lid of gebeurtenis.',
  },
  'pl-PL': {
    filterHint:
      'Wybierz, od kogo chcesz otrzymywać powiadomienia i jakie zdarzenia.',
    membersLabel: 'Powiadamiaj mnie o',
    notifyAllMembers: 'Wszyscy w grupie',
    notifySpecificMembers: 'Lub tylko ci członkowie:',
    eventsLabel: 'Zdarzenia',
    eventCreate: 'Dodano wydatek',
    eventUpdate: 'Zaktualizowano wydatek',
    eventDelete: 'Usunięto wydatek',
    selectAtLeastOneFilter:
      'Wybierz co najmniej jednego członka lub zdarzenie.',
  },
  'pt-BR': {
    filterHint: 'Escolha de quem você quer alertas e quais eventos receber.',
    membersLabel: 'Notificar-me sobre',
    notifyAllMembers: 'Todos no grupo',
    notifySpecificMembers: 'Ou apenas estes membros:',
    eventsLabel: 'Eventos',
    eventCreate: 'Despesa criada',
    eventUpdate: 'Despesa atualizada',
    eventDelete: 'Despesa excluída',
    selectAtLeastOneFilter: 'Selecione pelo menos um membro ou evento.',
  },
  'pt-PT': {
    filterHint: 'Escolhe de quem queres alertas e que eventos receber.',
    notifyAllMembers: 'Todos no grupo',
  },
  ro: {
    filterHint: 'Alege de la cine vrei alerte și ce evenimente să primești.',
    membersLabel: 'Notifică-mă despre',
    notifyAllMembers: 'Toată lumea din grup',
    notifySpecificMembers: 'Sau doar acești membri:',
    eventsLabel: 'Evenimente',
    eventCreate: 'Cheltuială creată',
    eventUpdate: 'Cheltuială actualizată',
    eventDelete: 'Cheltuială ștearsă',
    selectAtLeastOneFilter: 'Selectează cel puțin un membru sau un eveniment.',
  },
  'ru-RU': {
    filterHint: 'Выберите, от кого получать уведомления и о каких событиях.',
    membersLabel: 'Уведомлять меня о',
    notifyAllMembers: 'Все в группе',
    notifySpecificMembers: 'Или только эти участники:',
    eventsLabel: 'События',
    eventCreate: 'Расход добавлен',
    eventUpdate: 'Расход изменён',
    eventDelete: 'Расход удалён',
    selectAtLeastOneFilter: 'Выберите хотя бы одного участника или событие.',
  },
  'tr-TR': {
    filterHint:
      'Kimin değişikliklerinden haberdar olacağınızı ve hangi olayları seçin.',
    membersLabel: 'Beni şunlar hakkında bilgilendir',
    notifyAllMembers: 'Gruptaki herkes',
    notifySpecificMembers: 'Veya yalnızca bu üyeler:',
    eventsLabel: 'Olaylar',
    eventCreate: 'Gider oluşturuldu',
    eventUpdate: 'Gider güncellendi',
    eventDelete: 'Gider silindi',
    selectAtLeastOneFilter: 'En az bir üye veya olay seçin.',
  },
  'ua-UA': {
    filterHint: 'Оберіть, від кого отримувати сповіщення та які події.',
    membersLabel: 'Сповіщати мене про',
    notifyAllMembers: 'Усі в групі',
    notifySpecificMembers: 'Або лише ці учасники:',
    eventsLabel: 'Події',
    eventCreate: 'Витрату додано',
    eventUpdate: 'Витрату оновлено',
    eventDelete: 'Витрату видалено',
    selectAtLeastOneFilter: 'Оберіть принаймні одного учасника або подію.',
  },
  'zh-CN': {
    filterHint: '选择要接收谁的通知以及哪些事件。',
    membersLabel: '通知我关于',
    notifyAllMembers: '群组所有人',
    notifySpecificMembers: '或仅这些成员：',
    eventsLabel: '事件',
    eventCreate: '已创建支出',
    eventUpdate: '已更新支出',
    eventDelete: '已删除支出',
    selectAtLeastOneFilter: '请至少选择一名成员或一种事件。',
  },
  'zh-TW': {
    filterHint: '選擇要接收誰的通知以及哪些事件。',
    membersLabel: '通知我關於',
    notifyAllMembers: '群組所有人',
    notifySpecificMembers: '或僅這些成員：',
    eventsLabel: '事件',
    eventCreate: '已新增支出',
    eventUpdate: '已更新支出',
    eventDelete: '已刪除支出',
    selectAtLeastOneFilter: '請至少選擇一名成員或一種事件。',
  },
}

function localeFromFilename(filename) {
  return filename.replace(/\.json$/, '')
}

function main() {
  const files = fs
    .readdirSync(MESSAGES_DIR)
    .filter((f) => f.endsWith('.json') && f !== 'en-US.json')

  for (const file of files) {
    const locale = localeFromFilename(file)
    const filePath = path.join(MESSAGES_DIR, file)
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'))

    if (!data.Notifications) {
      console.warn(`Skip ${file}: no Notifications namespace`)
      continue
    }

    const patch = NOTIFICATION_PATCHES[locale]
    if (patch) {
      Object.assign(data.Notifications, patch)
    }

    for (const key of OBSOLETE_NOTIFICATION_KEYS) {
      delete data.Notifications[key]
    }

    fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`)
    console.log(`Updated ${file}`)
  }
}

main()
