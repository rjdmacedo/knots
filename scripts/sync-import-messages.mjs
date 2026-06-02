/**
 * Syncs import and group lifecycle namespaces from localized patches.
 *
 * Usage: node scripts/sync-import-messages.mjs
 */
import fs from 'node:fs'
import path from 'node:path'

const MESSAGES_DIR = path.resolve(import.meta.dirname, '../messages')

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function deepMerge(target, patch) {
  for (const [key, value] of Object.entries(patch)) {
    if (isRecord(value)) {
      if (!isRecord(target[key])) {
        target[key] = {}
      }

      deepMerge(target[key], value)
    } else {
      target[key] = value
    }
  }

  return target
}

const PATCHES = {
  ca: {
    ExpenseImport: {
      button: 'Importa despeses',
      fromKnots: 'Importa des de Knots',
      fromSplitwise: 'Importa des de Splitwise',
    },
    KnotsImport: {
      title: 'Importa des de Knots',
      description:
        'Puja un fitxer exportat de Knots. Si el fitxer inclou persones que encara no són al grup, les pots afegir aquí abans d’importar.',
      fileLabel: 'Fitxer d’exportació de Knots',
      previewLabel: 'Previsualització (primeres 10 línies)',
      clear: 'Esborra',
      cancel: 'Cancel·la',
      import: 'Importa despeses',
      addAndImport: 'Afegeix membres i importa',
      importing: 'Important...',
      analyzing: 'Analitzant l’exportació…',
      expenseCount:
        '{count, plural, one {S’ha trobat # despesa} other {S’han trobat # despeses}}',
      matchedParticipants: 'Ja són al grup: {names}',
      missingParticipantsLabel: 'Persones per afegir a aquest grup',
      missingParticipantsDescription:
        'Introdueix un correu electrònic per a cada persona. Els comptes nous es creen automàticament i s’enllacen amb aquest grup. Si ja tenen compte, s’afegeixen com a membres.',
      expenseReferences: '{count, plural, one {# despesa} other {# despeses}}',
      emailLabel: 'Correu electrònic',
      emailPlaceholder: 'nom@example.com',
      softCreateHint:
        'Es podran registrar més endavant amb aquest correu per accedir al grup.',
      toast: {
        invalidFileType: {
          title: 'Tipus de fitxer no vàlid',
          description: 'Selecciona un fitxer JSON o CSV exportat de Knots.',
        },
        noContent: {
          title: 'Fitxer sense contingut',
          description: 'Selecciona primer un fitxer d’exportació de Knots.',
        },
        missingEmail: {
          title: 'Cal un correu electrònic',
          description: 'Introdueix el correu electrònic de {name}.',
        },
        success: {
          title: 'Importació completada',
          description: 'S’han importat {count} despeses de Knots.',
        },
        error: {
          title: 'Ha fallat la importació',
          description: 'No s’ha pogut importar el fitxer de Knots.',
        },
        cancelled: {
          title: 'Importació cancel·lada',
          description: 'La importació s’ha aturat abans d’acabar.',
        },
      },
    },
    SplitwiseImport: {
      toast: {
        cancelled: {
          title: 'Importació cancel·lada',
          description: 'La importació s’ha aturat abans d’acabar.',
        },
      },
    },
    MyGroups: {
      leaveGroupSuccess: 'Has sortit de “{name}”.',
      activeGroups: 'Grups actius',
      archivedGroups: 'Grups arxivats',
      archiveSuccess: 'Grup arxivat.',
      unarchiveSuccess: 'Grup restaurat.',
      deleteGroup: 'Suprimeix el grup',
      deleteSuccess: 'Grup suprimit.',
      deleteGroupConfirmTitle: 'Vols suprimir el grup definitivament?',
      deleteGroupConfirmDescription:
        'Això suprimirà definitivament “{name}” i totes les seves despeses, saldos i historial per a tots els membres. No es pot desfer.',
      deleteGroupConfirmCancel: 'Cancel·la',
      deleteGroupConfirmAction: 'Suprimeix definitivament',
    },
    GroupDangerZone: {
      title: 'Gestió del grup',
      description:
        'Arxivar amaga aquest grup de la teva llista sense esborrar-ne les dades. Suprimir elimina el grup definitivament per a tothom.',
      archive: 'Arxiva el grup',
      unarchive: 'Restaura el grup',
      delete: 'Suprimeix el grup',
      archiveSuccess: 'Grup arxivat.',
      unarchiveSuccess: 'Grup restaurat.',
      deleteSuccess: 'Grup suprimit.',
      deleteConfirmTitle: 'Vols suprimir el grup definitivament?',
      deleteConfirmDescription:
        'Això suprimirà definitivament “{name}” i totes les seves despeses, saldos i historial per a tots els membres. No es pot desfer.',
      cancel: 'Cancel·la',
      deleteConfirmAction: 'Suprimeix definitivament',
    },
  },
  'cs-CZ': {
    ExpenseImport: {
      button: 'Importovat výdaje',
      fromKnots: 'Importovat z Knots',
      fromSplitwise: 'Importovat ze Splitwise',
    },
    KnotsImport: {
      title: 'Importovat z Knots',
      description:
        'Nahrajte exportní soubor z Knots. Pokud soubor obsahuje lidi, kteří ještě nejsou v této skupině, můžete je před importem přidat zde.',
      fileLabel: 'Exportní soubor Knots',
      previewLabel: 'Náhled (prvních 10 řádků)',
      clear: 'Vymazat',
      cancel: 'Zrušit',
      import: 'Importovat výdaje',
      addAndImport: 'Přidat členy a importovat',
      importing: 'Importuje se...',
      analyzing: 'Analyzuje se export…',
      expenseCount:
        '{count, plural, one {Nalezen # výdaj} few {Nalezeny # výdaje} other {Nalezeno # výdajů}}',
      matchedParticipants: 'Již ve skupině: {names}',
      missingParticipantsLabel: 'Lidé k přidání do této skupiny',
      missingParticipantsDescription:
        'Zadejte e-mail pro každou osobu. Nové účty se vytvoří automaticky a propojí se s touto skupinou. Pokud už účet mají, budou přidáni jako členové.',
      expenseReferences:
        '{count, plural, one {# výdaj} few {# výdaje} other {# výdajů}}',
      emailLabel: 'E-mail',
      emailPlaceholder: 'jmeno@example.com',
      softCreateHint:
        'Později se mohou s tímto e-mailem zaregistrovat a získat přístup ke skupině.',
      toast: {
        invalidFileType: {
          title: 'Neplatný typ souboru',
          description:
            'Vyberte exportní soubor Knots ve formátu JSON nebo CSV.',
        },
        noContent: {
          title: 'Soubor nemá obsah',
          description: 'Nejprve vyberte exportní soubor Knots.',
        },
        missingEmail: {
          title: 'E-mail je povinný',
          description: 'Zadejte e-mail pro {name}.',
        },
        success: {
          title: 'Import dokončen',
          description: 'Úspěšně importováno {count} výdajů z Knots.',
        },
        error: {
          title: 'Import se nezdařil',
          description: 'Exportní soubor Knots se nepodařilo importovat.',
        },
        cancelled: {
          title: 'Import zrušen',
          description: 'Import byl zastaven před dokončením.',
        },
      },
    },
    SplitwiseImport: {
      toast: {
        cancelled: {
          title: 'Import zrušen',
          description: 'Import byl zastaven před dokončením.',
        },
      },
    },
    MyGroups: {
      leaveGroupSuccess: 'Opustili jste „{name}“.',
      activeGroups: 'Aktivní skupiny',
      archivedGroups: 'Archivované skupiny',
      archiveSuccess: 'Skupina archivována.',
      unarchiveSuccess: 'Skupina obnovena.',
      deleteGroup: 'Smazat skupinu',
      deleteSuccess: 'Skupina smazána.',
      deleteGroupConfirmTitle: 'Smazat skupinu trvale?',
      deleteGroupConfirmDescription:
        'Tím trvale smažete „{name}“ a všechny její výdaje, zůstatky a historii pro všechny členy. Tuto akci nelze vrátit zpět.',
      deleteGroupConfirmCancel: 'Zrušit',
      deleteGroupConfirmAction: 'Smazat trvale',
    },
    GroupDangerZone: {
      title: 'Správa skupiny',
      description:
        'Archivace skryje tuto skupinu ze seznamu bez odstranění dat. Smazání trvale odstraní skupinu pro všechny.',
      archive: 'Archivovat skupinu',
      unarchive: 'Obnovit skupinu',
      delete: 'Smazat skupinu',
      archiveSuccess: 'Skupina archivována.',
      unarchiveSuccess: 'Skupina obnovena.',
      deleteSuccess: 'Skupina smazána.',
      deleteConfirmTitle: 'Smazat skupinu trvale?',
      deleteConfirmDescription:
        'Tím trvale smažete „{name}“ a všechny její výdaje, zůstatky a historii pro všechny členy. Tuto akci nelze vrátit zpět.',
      cancel: 'Zrušit',
      deleteConfirmAction: 'Smazat trvale',
    },
  },
  'de-DE': {
    ExpenseImport: {
      button: 'Ausgaben importieren',
      fromKnots: 'Aus Knots importieren',
      fromSplitwise: 'Aus Splitwise importieren',
    },
    KnotsImport: {
      title: 'Aus Knots importieren',
      description:
        'Lade eine Knots-Exportdatei hoch. Wenn die Datei Personen enthält, die noch nicht in dieser Gruppe sind, kannst du sie vor dem Import hier hinzufügen.',
      fileLabel: 'Knots-Exportdatei',
      previewLabel: 'Vorschau (erste 10 Zeilen)',
      clear: 'Leeren',
      cancel: 'Abbrechen',
      import: 'Ausgaben importieren',
      addAndImport: 'Mitglieder hinzufügen und importieren',
      importing: 'Import läuft...',
      analyzing: 'Export wird analysiert…',
      expenseCount:
        '{count, plural, one {# Ausgabe gefunden} other {# Ausgaben gefunden}}',
      matchedParticipants: 'Bereits in der Gruppe: {names}',
      missingParticipantsLabel:
        'Personen, die zu dieser Gruppe hinzugefügt werden',
      missingParticipantsDescription:
        'Gib für jede Person eine E-Mail-Adresse ein. Neue Konten werden automatisch erstellt und mit dieser Gruppe verknüpft. Wenn sie bereits ein Konto haben, werden sie als Mitglieder hinzugefügt.',
      expenseReferences: '{count, plural, one {# Ausgabe} other {# Ausgaben}}',
      emailLabel: 'E-Mail',
      emailPlaceholder: 'name@example.com',
      softCreateHint:
        'Sie können sich später mit dieser E-Mail-Adresse registrieren, um auf die Gruppe zuzugreifen.',
      toast: {
        invalidFileType: {
          title: 'Ungültiger Dateityp',
          description:
            'Bitte wähle eine Knots-Exportdatei im JSON- oder CSV-Format aus.',
        },
        noContent: {
          title: 'Kein Dateiinhalt',
          description: 'Bitte wähle zuerst eine Knots-Exportdatei aus.',
        },
        missingEmail: {
          title: 'E-Mail erforderlich',
          description: 'Gib eine E-Mail-Adresse für {name} ein.',
        },
        success: {
          title: 'Import erfolgreich',
          description:
            '{count} Ausgaben wurden erfolgreich aus Knots importiert.',
        },
        error: {
          title: 'Import fehlgeschlagen',
          description: 'Die Knots-Exportdatei konnte nicht importiert werden.',
        },
        cancelled: {
          title: 'Import abgebrochen',
          description: 'Der Import wurde vor Abschluss gestoppt.',
        },
      },
    },
    SplitwiseImport: {
      toast: {
        cancelled: {
          title: 'Import abgebrochen',
          description: 'Der Import wurde vor Abschluss gestoppt.',
        },
      },
    },
    MyGroups: {
      leaveGroupSuccess: 'Du hast „{name}“ verlassen.',
      activeGroups: 'Aktive Gruppen',
      archivedGroups: 'Archivierte Gruppen',
      archiveSuccess: 'Gruppe archiviert.',
      unarchiveSuccess: 'Gruppe wiederhergestellt.',
      deleteGroup: 'Gruppe löschen',
      deleteSuccess: 'Gruppe gelöscht.',
      deleteGroupConfirmTitle: 'Gruppe dauerhaft löschen?',
      deleteGroupConfirmDescription:
        'Dadurch werden „{name}“ sowie alle Ausgaben, Salden und der Verlauf für alle Mitglieder dauerhaft gelöscht. Dies kann nicht rückgängig gemacht werden.',
      deleteGroupConfirmCancel: 'Abbrechen',
      deleteGroupConfirmAction: 'Dauerhaft löschen',
    },
    GroupDangerZone: {
      title: 'Gruppenverwaltung',
      description:
        'Archivieren blendet diese Gruppe in deiner Liste aus, ohne Daten zu löschen. Löschen entfernt die Gruppe dauerhaft für alle.',
      archive: 'Gruppe archivieren',
      unarchive: 'Gruppe wiederherstellen',
      delete: 'Gruppe löschen',
      archiveSuccess: 'Gruppe archiviert.',
      unarchiveSuccess: 'Gruppe wiederhergestellt.',
      deleteSuccess: 'Gruppe gelöscht.',
      deleteConfirmTitle: 'Gruppe dauerhaft löschen?',
      deleteConfirmDescription:
        'Dadurch werden „{name}“ sowie alle Ausgaben, Salden und der Verlauf für alle Mitglieder dauerhaft gelöscht. Dies kann nicht rückgängig gemacht werden.',
      cancel: 'Abbrechen',
      deleteConfirmAction: 'Dauerhaft löschen',
    },
  },
  es: {
    ExpenseImport: {
      button: 'Importar gastos',
      fromKnots: 'Importar desde Knots',
      fromSplitwise: 'Importar desde Splitwise',
    },
    KnotsImport: {
      title: 'Importar desde Knots',
      description:
        'Sube un archivo exportado de Knots. Si el archivo incluye personas que aún no están en este grupo, puedes añadirlas aquí antes de importar.',
      fileLabel: 'Archivo de exportación de Knots',
      previewLabel: 'Vista previa (primeras 10 líneas)',
      clear: 'Limpiar',
      cancel: 'Cancelar',
      import: 'Importar gastos',
      addAndImport: 'Añadir miembros e importar',
      importing: 'Importando...',
      analyzing: 'Analizando exportación…',
      expenseCount:
        '{count, plural, one {# gasto encontrado} other {# gastos encontrados}}',
      matchedParticipants: 'Ya están en el grupo: {names}',
      missingParticipantsLabel: 'Personas para añadir a este grupo',
      missingParticipantsDescription:
        'Introduce un correo electrónico para cada persona. Las cuentas nuevas se crean automáticamente y se vinculan a este grupo. Si ya tienen cuenta, se añaden como miembros.',
      expenseReferences: '{count, plural, one {# gasto} other {# gastos}}',
      emailLabel: 'Correo electrónico',
      emailPlaceholder: 'nombre@example.com',
      softCreateHint:
        'Podrán registrarse más tarde con este correo para acceder al grupo.',
      toast: {
        invalidFileType: {
          title: 'Tipo de archivo no válido',
          description: 'Selecciona un archivo JSON o CSV exportado de Knots.',
        },
        noContent: {
          title: 'Archivo sin contenido',
          description: 'Selecciona primero un archivo de exportación de Knots.',
        },
        missingEmail: {
          title: 'Correo obligatorio',
          description: 'Introduce el correo de {name}.',
        },
        success: {
          title: 'Importación completada',
          description: 'Se importaron correctamente {count} gastos de Knots.',
        },
        error: {
          title: 'Error al importar',
          description: 'No se pudo importar el archivo de Knots.',
        },
        cancelled: {
          title: 'Importación cancelada',
          description: 'La importación se detuvo antes de terminar.',
        },
      },
    },
    SplitwiseImport: {
      toast: {
        cancelled: {
          title: 'Importación cancelada',
          description: 'La importación se detuvo antes de terminar.',
        },
      },
    },
    MyGroups: {
      leaveGroupSuccess: 'Has salido de “{name}”.',
      activeGroups: 'Grupos activos',
      archivedGroups: 'Grupos archivados',
      archiveSuccess: 'Grupo archivado.',
      unarchiveSuccess: 'Grupo restaurado.',
      deleteGroup: 'Eliminar grupo',
      deleteSuccess: 'Grupo eliminado.',
      deleteGroupConfirmTitle: '¿Eliminar el grupo permanentemente?',
      deleteGroupConfirmDescription:
        'Esto eliminará permanentemente “{name}” y todos sus gastos, saldos e historial para todos los miembros. No se puede deshacer.',
      deleteGroupConfirmCancel: 'Cancelar',
      deleteGroupConfirmAction: 'Eliminar permanentemente',
    },
    GroupDangerZone: {
      title: 'Gestión del grupo',
      description:
        'Archivar oculta este grupo de tu lista sin eliminar datos. Eliminar borra permanentemente el grupo para todos.',
      archive: 'Archivar grupo',
      unarchive: 'Restaurar grupo',
      delete: 'Eliminar grupo',
      archiveSuccess: 'Grupo archivado.',
      unarchiveSuccess: 'Grupo restaurado.',
      deleteSuccess: 'Grupo eliminado.',
      deleteConfirmTitle: '¿Eliminar el grupo permanentemente?',
      deleteConfirmDescription:
        'Esto eliminará permanentemente “{name}” y todos sus gastos, saldos e historial para todos los miembros. No se puede deshacer.',
      cancel: 'Cancelar',
      deleteConfirmAction: 'Eliminar permanentemente',
    },
  },
  fi: {
    ExpenseImport: {
      button: 'Tuo kuluja',
      fromKnots: 'Tuo Knotsista',
      fromSplitwise: 'Tuo Splitwisesta',
    },
    KnotsImport: {
      title: 'Tuo Knotsista',
      description:
        'Lataa Knots-vientitiedosto. Jos tiedostossa on henkilöitä, jotka eivät vielä kuulu tähän ryhmään, voit lisätä heidät täällä ennen tuontia.',
      fileLabel: 'Knots-vientitiedosto',
      previewLabel: 'Esikatselu (ensimmäiset 10 riviä)',
      clear: 'Tyhjennä',
      cancel: 'Peruuta',
      import: 'Tuo kulut',
      addAndImport: 'Lisää jäsenet ja tuo',
      importing: 'Tuodaan...',
      analyzing: 'Analysoidaan vientiä…',
      expenseCount:
        '{count, plural, one {# kulu löytyi} other {# kulua löytyi}}',
      matchedParticipants: 'Jo ryhmässä: {names}',
      missingParticipantsLabel: 'Tähän ryhmään lisättävät henkilöt',
      missingParticipantsDescription:
        'Anna jokaiselle henkilölle sähköpostiosoite. Uudet tilit luodaan automaattisesti ja liitetään tähän ryhmään. Jos heillä on jo tili, heidät lisätään jäseniksi.',
      expenseReferences: '{count, plural, one {# kulu} other {# kulua}}',
      emailLabel: 'Sähköposti',
      emailPlaceholder: 'nimi@example.com',
      softCreateHint:
        'He voivat rekisteröityä myöhemmin tällä sähköpostilla päästäkseen ryhmään.',
      toast: {
        invalidFileType: {
          title: 'Virheellinen tiedostotyyppi',
          description: 'Valitse Knots-vientitiedosto JSON- tai CSV-muodossa.',
        },
        noContent: {
          title: 'Ei tiedoston sisältöä',
          description: 'Valitse ensin Knots-vientitiedosto.',
        },
        missingEmail: {
          title: 'Sähköposti vaaditaan',
          description: 'Anna sähköposti henkilölle {name}.',
        },
        success: {
          title: 'Tuonti onnistui',
          description: '{count} kulua tuotiin onnistuneesti Knotsista.',
        },
        error: {
          title: 'Tuonti epäonnistui',
          description: 'Knots-vientitiedoston tuonti epäonnistui.',
        },
        cancelled: {
          title: 'Tuonti peruutettu',
          description: 'Tuonti pysäytettiin ennen valmistumista.',
        },
      },
    },
    SplitwiseImport: {
      toast: {
        cancelled: {
          title: 'Tuonti peruutettu',
          description: 'Tuonti pysäytettiin ennen valmistumista.',
        },
      },
    },
    MyGroups: {
      leaveGroupSuccess: 'Poistuit ryhmästä “{name}”.',
      activeGroups: 'Aktiiviset ryhmät',
      archivedGroups: 'Arkistoidut ryhmät',
      archiveSuccess: 'Ryhmä arkistoitu.',
      unarchiveSuccess: 'Ryhmä palautettu.',
      deleteGroup: 'Poista ryhmä',
      deleteSuccess: 'Ryhmä poistettu.',
      deleteGroupConfirmTitle: 'Poistetaanko ryhmä pysyvästi?',
      deleteGroupConfirmDescription:
        'Tämä poistaa pysyvästi ryhmän “{name}” sekä kaikki sen kulut, saldot ja historian kaikilta jäseniltä. Tätä ei voi kumota.',
      deleteGroupConfirmCancel: 'Peruuta',
      deleteGroupConfirmAction: 'Poista pysyvästi',
    },
    GroupDangerZone: {
      title: 'Ryhmän hallinta',
      description:
        'Arkistointi piilottaa ryhmän listaltasi poistamatta tietoja. Poistaminen poistaa ryhmän pysyvästi kaikilta.',
      archive: 'Arkistoi ryhmä',
      unarchive: 'Palauta ryhmä',
      delete: 'Poista ryhmä',
      archiveSuccess: 'Ryhmä arkistoitu.',
      unarchiveSuccess: 'Ryhmä palautettu.',
      deleteSuccess: 'Ryhmä poistettu.',
      deleteConfirmTitle: 'Poistetaanko ryhmä pysyvästi?',
      deleteConfirmDescription:
        'Tämä poistaa pysyvästi ryhmän “{name}” sekä kaikki sen kulut, saldot ja historian kaikilta jäseniltä. Tätä ei voi kumota.',
      cancel: 'Peruuta',
      deleteConfirmAction: 'Poista pysyvästi',
    },
  },
  'fr-FR': {
    ExpenseImport: {
      button: 'Importer des dépenses',
      fromKnots: 'Importer depuis Knots',
      fromSplitwise: 'Importer depuis Splitwise',
    },
    KnotsImport: {
      title: 'Importer depuis Knots',
      description:
        'Importez un fichier d’export Knots. Si le fichier contient des personnes qui ne sont pas encore dans ce groupe, vous pouvez les ajouter ici avant l’import.',
      fileLabel: 'Fichier d’export Knots',
      previewLabel: 'Aperçu (10 premières lignes)',
      clear: 'Effacer',
      cancel: 'Annuler',
      import: 'Importer les dépenses',
      addAndImport: 'Ajouter les membres et importer',
      importing: 'Importation...',
      analyzing: 'Analyse de l’export…',
      expenseCount:
        '{count, plural, one {# dépense trouvée} other {# dépenses trouvées}}',
      matchedParticipants: 'Déjà dans le groupe : {names}',
      missingParticipantsLabel: 'Personnes à ajouter à ce groupe',
      missingParticipantsDescription:
        'Saisissez un e-mail pour chaque personne. Les nouveaux comptes sont créés automatiquement et associés à ce groupe. Si elles ont déjà un compte, elles sont ajoutées comme membres.',
      expenseReferences: '{count, plural, one {# dépense} other {# dépenses}}',
      emailLabel: 'E-mail',
      emailPlaceholder: 'nom@example.com',
      softCreateHint:
        'Elles pourront s’inscrire plus tard avec cet e-mail pour accéder au groupe.',
      toast: {
        invalidFileType: {
          title: 'Type de fichier non valide',
          description:
            'Sélectionnez un fichier d’export Knots au format JSON ou CSV.',
        },
        noContent: {
          title: 'Aucun contenu',
          description: 'Sélectionnez d’abord un fichier d’export Knots.',
        },
        missingEmail: {
          title: 'E-mail requis',
          description: 'Saisissez un e-mail pour {name}.',
        },
        success: {
          title: 'Import réussi',
          description: '{count} dépenses ont été importées depuis Knots.',
        },
        error: {
          title: 'Échec de l’import',
          description: 'Impossible d’importer le fichier d’export Knots.',
        },
        cancelled: {
          title: 'Import annulé',
          description: 'L’import a été arrêté avant la fin.',
        },
      },
    },
    SplitwiseImport: {
      toast: {
        cancelled: {
          title: 'Import annulé',
          description: 'L’import a été arrêté avant la fin.',
        },
      },
    },
    MyGroups: {
      leaveGroupSuccess: 'Vous avez quitté « {name} ».',
      activeGroups: 'Groupes actifs',
      archivedGroups: 'Groupes archivés',
      archiveSuccess: 'Groupe archivé.',
      unarchiveSuccess: 'Groupe restauré.',
      deleteGroup: 'Supprimer le groupe',
      deleteSuccess: 'Groupe supprimé.',
      deleteGroupConfirmTitle: 'Supprimer définitivement le groupe ?',
      deleteGroupConfirmDescription:
        'Cela supprimera définitivement « {name} » ainsi que toutes ses dépenses, soldes et son historique pour tous les membres. Cette action est irréversible.',
      deleteGroupConfirmCancel: 'Annuler',
      deleteGroupConfirmAction: 'Supprimer définitivement',
    },
    GroupDangerZone: {
      title: 'Gestion du groupe',
      description:
        'Archiver masque ce groupe de votre liste sans supprimer les données. Supprimer retire définitivement le groupe pour tout le monde.',
      archive: 'Archiver le groupe',
      unarchive: 'Restaurer le groupe',
      delete: 'Supprimer le groupe',
      archiveSuccess: 'Groupe archivé.',
      unarchiveSuccess: 'Groupe restauré.',
      deleteSuccess: 'Groupe supprimé.',
      deleteConfirmTitle: 'Supprimer définitivement le groupe ?',
      deleteConfirmDescription:
        'Cela supprimera définitivement « {name} » ainsi que toutes ses dépenses, soldes et son historique pour tous les membres. Cette action est irréversible.',
      cancel: 'Annuler',
      deleteConfirmAction: 'Supprimer définitivement',
    },
  },
  'it-IT': {
    ExpenseImport: {
      button: 'Importa spese',
      fromKnots: 'Importa da Knots',
      fromSplitwise: 'Importa da Splitwise',
    },
    KnotsImport: {
      title: 'Importa da Knots',
      description:
        'Carica un file esportato da Knots. Se il file include persone che non fanno ancora parte di questo gruppo, puoi aggiungerle qui prima di importare.',
      fileLabel: 'File di esportazione Knots',
      previewLabel: 'Anteprima (prime 10 righe)',
      clear: 'Cancella',
      cancel: 'Annulla',
      import: 'Importa spese',
      addAndImport: 'Aggiungi membri e importa',
      importing: 'Importazione...',
      analyzing: 'Analisi dell’esportazione…',
      expenseCount:
        '{count, plural, one {# spesa trovata} other {# spese trovate}}',
      matchedParticipants: 'Già nel gruppo: {names}',
      missingParticipantsLabel: 'Persone da aggiungere a questo gruppo',
      missingParticipantsDescription:
        'Inserisci un’e-mail per ogni persona. I nuovi account vengono creati automaticamente e collegati a questo gruppo. Se hanno già un account, vengono aggiunti come membri.',
      expenseReferences: '{count, plural, one {# spesa} other {# spese}}',
      emailLabel: 'E-mail',
      emailPlaceholder: 'nome@example.com',
      softCreateHint:
        'Potranno registrarsi più tardi con questa e-mail per accedere al gruppo.',
      toast: {
        invalidFileType: {
          title: 'Tipo di file non valido',
          description:
            'Seleziona un file di esportazione Knots in formato JSON o CSV.',
        },
        noContent: {
          title: 'Nessun contenuto',
          description: 'Seleziona prima un file di esportazione Knots.',
        },
        missingEmail: {
          title: 'E-mail obbligatoria',
          description: 'Inserisci un’e-mail per {name}.',
        },
        success: {
          title: 'Importazione completata',
          description: '{count} spese importate correttamente da Knots.',
        },
        error: {
          title: 'Importazione non riuscita',
          description: 'Impossibile importare il file di esportazione Knots.',
        },
        cancelled: {
          title: 'Importazione annullata',
          description: 'L’importazione è stata interrotta prima del termine.',
        },
      },
    },
    SplitwiseImport: {
      toast: {
        cancelled: {
          title: 'Importazione annullata',
          description: 'L’importazione è stata interrotta prima del termine.',
        },
      },
    },
    MyGroups: {
      leaveGroupSuccess: 'Hai lasciato “{name}”.',
      activeGroups: 'Gruppi attivi',
      archivedGroups: 'Gruppi archiviati',
      archiveSuccess: 'Gruppo archiviato.',
      unarchiveSuccess: 'Gruppo ripristinato.',
      deleteGroup: 'Elimina gruppo',
      deleteSuccess: 'Gruppo eliminato.',
      deleteGroupConfirmTitle: 'Eliminare definitivamente il gruppo?',
      deleteGroupConfirmDescription:
        'Questa azione eliminerà definitivamente “{name}” e tutte le sue spese, i saldi e la cronologia per tutti i membri. Non può essere annullata.',
      deleteGroupConfirmCancel: 'Annulla',
      deleteGroupConfirmAction: 'Elimina definitivamente',
    },
    GroupDangerZone: {
      title: 'Gestione del gruppo',
      description:
        'L’archiviazione nasconde questo gruppo dalla tua lista senza eliminare i dati. L’eliminazione rimuove definitivamente il gruppo per tutti.',
      archive: 'Archivia gruppo',
      unarchive: 'Ripristina gruppo',
      delete: 'Elimina gruppo',
      archiveSuccess: 'Gruppo archiviato.',
      unarchiveSuccess: 'Gruppo ripristinato.',
      deleteSuccess: 'Gruppo eliminato.',
      deleteConfirmTitle: 'Eliminare definitivamente il gruppo?',
      deleteConfirmDescription:
        'Questa azione eliminerà definitivamente “{name}” e tutte le sue spese, i saldi e la cronologia per tutti i membri. Non può essere annullata.',
      cancel: 'Annulla',
      deleteConfirmAction: 'Elimina definitivamente',
    },
  },
  'ja-JP': {
    ExpenseImport: {
      button: '支出をインポート',
      fromKnots: 'Knots からインポート',
      fromSplitwise: 'Splitwise からインポート',
    },
    KnotsImport: {
      title: 'Knots からインポート',
      description:
        'Knots のエクスポートファイルをアップロードしてください。ファイルにまだこのグループにいない人が含まれている場合は、インポート前にここで追加できます。',
      fileLabel: 'Knots エクスポートファイル',
      previewLabel: 'プレビュー（最初の 10 行）',
      clear: 'クリア',
      cancel: 'キャンセル',
      import: '支出をインポート',
      addAndImport: 'メンバーを追加してインポート',
      importing: 'インポート中...',
      analyzing: 'エクスポートを解析中…',
      expenseCount:
        '{count, plural, one {# 件の支出が見つかりました} other {# 件の支出が見つかりました}}',
      matchedParticipants: 'すでにグループ内: {names}',
      missingParticipantsLabel: 'このグループに追加する人',
      missingParticipantsDescription:
        '各人のメールアドレスを入力してください。新しいアカウントは自動的に作成され、このグループにリンクされます。すでにアカウントがある場合はメンバーとして追加されます。',
      expenseReferences: '{count, plural, one {# 件の支出} other {# 件の支出}}',
      emailLabel: 'メール',
      emailPlaceholder: 'name@example.com',
      softCreateHint:
        '後でこのメールアドレスで登録すると、グループにアクセスできます。',
      toast: {
        invalidFileType: {
          title: '無効なファイル形式',
          description:
            'Knots の JSON または CSV エクスポートファイルを選択してください。',
        },
        noContent: {
          title: 'ファイル内容がありません',
          description: 'まず Knots エクスポートファイルを選択してください。',
        },
        missingEmail: {
          title: 'メールが必要です',
          description: '{name} のメールアドレスを入力してください。',
        },
        success: {
          title: 'インポート成功',
          description: 'Knots から {count} 件の支出をインポートしました。',
        },
        error: {
          title: 'インポート失敗',
          description:
            'Knots エクスポートファイルをインポートできませんでした。',
        },
        cancelled: {
          title: 'インポートをキャンセルしました',
          description: 'インポートは完了前に停止されました。',
        },
      },
    },
    SplitwiseImport: {
      toast: {
        cancelled: {
          title: 'インポートをキャンセルしました',
          description: 'インポートは完了前に停止されました。',
        },
      },
    },
    MyGroups: {
      leaveGroupSuccess: '“{name}”から退出しました。',
      activeGroups: 'アクティブなグループ',
      archivedGroups: 'アーカイブ済みグループ',
      archiveSuccess: 'グループをアーカイブしました。',
      unarchiveSuccess: 'グループを復元しました。',
      deleteGroup: 'グループを削除',
      deleteSuccess: 'グループを削除しました。',
      deleteGroupConfirmTitle: 'グループを完全に削除しますか？',
      deleteGroupConfirmDescription:
        '“{name}”と、そのすべての支出、残高、履歴が全メンバーに対して完全に削除されます。この操作は元に戻せません。',
      deleteGroupConfirmCancel: 'キャンセル',
      deleteGroupConfirmAction: '完全に削除',
    },
    GroupDangerZone: {
      title: 'グループ管理',
      description:
        'アーカイブするとデータを削除せずにリストから非表示にします。削除すると全員に対してグループが完全に削除されます。',
      archive: 'グループをアーカイブ',
      unarchive: 'グループを復元',
      delete: 'グループを削除',
      archiveSuccess: 'グループをアーカイブしました。',
      unarchiveSuccess: 'グループを復元しました。',
      deleteSuccess: 'グループを削除しました。',
      deleteConfirmTitle: 'グループを完全に削除しますか？',
      deleteConfirmDescription:
        '“{name}”と、そのすべての支出、残高、履歴が全メンバーに対して完全に削除されます。この操作は元に戻せません。',
      cancel: 'キャンセル',
      deleteConfirmAction: '完全に削除',
    },
  },
  'nl-NL': {
    ExpenseImport: {
      button: 'Uitgaven importeren',
      fromKnots: 'Importeren uit Knots',
      fromSplitwise: 'Importeren uit Splitwise',
    },
    KnotsImport: {
      title: 'Importeren uit Knots',
      description:
        'Upload een Knots-exportbestand. Als het bestand personen bevat die nog niet in deze groep zitten, kun je ze hier toevoegen voordat je importeert.',
      fileLabel: 'Knots-exportbestand',
      previewLabel: 'Voorbeeld (eerste 10 regels)',
      clear: 'Wissen',
      cancel: 'Annuleren',
      import: 'Uitgaven importeren',
      addAndImport: 'Leden toevoegen en importeren',
      importing: 'Importeren...',
      analyzing: 'Export analyseren…',
      expenseCount:
        '{count, plural, one {# uitgave gevonden} other {# uitgaven gevonden}}',
      matchedParticipants: 'Al in de groep: {names}',
      missingParticipantsLabel: 'Personen om aan deze groep toe te voegen',
      missingParticipantsDescription:
        'Voer voor elke persoon een e-mailadres in. Nieuwe accounts worden automatisch aangemaakt en aan deze groep gekoppeld. Als ze al een account hebben, worden ze als leden toegevoegd.',
      expenseReferences: '{count, plural, one {# uitgave} other {# uitgaven}}',
      emailLabel: 'E-mail',
      emailPlaceholder: 'naam@example.com',
      softCreateHint:
        'Ze kunnen zich later met dit e-mailadres registreren om toegang tot de groep te krijgen.',
      toast: {
        invalidFileType: {
          title: 'Ongeldig bestandstype',
          description:
            'Selecteer een Knots-exportbestand in JSON- of CSV-formaat.',
        },
        noContent: {
          title: 'Geen bestandsinhoud',
          description: 'Selecteer eerst een Knots-exportbestand.',
        },
        missingEmail: {
          title: 'E-mail verplicht',
          description: 'Voer een e-mailadres in voor {name}.',
        },
        success: {
          title: 'Import geslaagd',
          description: '{count} uitgaven succesvol geïmporteerd uit Knots.',
        },
        error: {
          title: 'Import mislukt',
          description: 'Het Knots-exportbestand kon niet worden geïmporteerd.',
        },
        cancelled: {
          title: 'Import geannuleerd',
          description: 'De import is gestopt voordat deze klaar was.',
        },
      },
    },
    SplitwiseImport: {
      toast: {
        cancelled: {
          title: 'Import geannuleerd',
          description: 'De import is gestopt voordat deze klaar was.',
        },
      },
    },
    MyGroups: {
      leaveGroupSuccess: 'Je hebt “{name}” verlaten.',
      activeGroups: 'Actieve groepen',
      archivedGroups: 'Gearchiveerde groepen',
      archiveSuccess: 'Groep gearchiveerd.',
      unarchiveSuccess: 'Groep hersteld.',
      deleteGroup: 'Groep verwijderen',
      deleteSuccess: 'Groep verwijderd.',
      deleteGroupConfirmTitle: 'Groep permanent verwijderen?',
      deleteGroupConfirmDescription:
        'Dit verwijdert “{name}” permanent, inclusief alle uitgaven, saldi en geschiedenis voor alle leden. Dit kan niet ongedaan worden gemaakt.',
      deleteGroupConfirmCancel: 'Annuleren',
      deleteGroupConfirmAction: 'Permanent verwijderen',
    },
    GroupDangerZone: {
      title: 'Groepsbeheer',
      description:
        'Archiveren verbergt deze groep in je lijst zonder gegevens te verwijderen. Verwijderen verwijdert de groep permanent voor iedereen.',
      archive: 'Groep archiveren',
      unarchive: 'Groep herstellen',
      delete: 'Groep verwijderen',
      archiveSuccess: 'Groep gearchiveerd.',
      unarchiveSuccess: 'Groep hersteld.',
      deleteSuccess: 'Groep verwijderd.',
      deleteConfirmTitle: 'Groep permanent verwijderen?',
      deleteConfirmDescription:
        'Dit verwijdert “{name}” permanent, inclusief alle uitgaven, saldi en geschiedenis voor alle leden. Dit kan niet ongedaan worden gemaakt.',
      cancel: 'Annuleren',
      deleteConfirmAction: 'Permanent verwijderen',
    },
  },
  'pl-PL': {
    ExpenseImport: {
      button: 'Importuj wydatki',
      fromKnots: 'Importuj z Knots',
      fromSplitwise: 'Importuj ze Splitwise',
    },
    KnotsImport: {
      title: 'Importuj z Knots',
      description:
        'Prześlij plik eksportu Knots. Jeśli plik zawiera osoby, których nie ma jeszcze w tej grupie, możesz dodać je tutaj przed importem.',
      fileLabel: 'Plik eksportu Knots',
      previewLabel: 'Podgląd (pierwsze 10 wierszy)',
      clear: 'Wyczyść',
      cancel: 'Anuluj',
      import: 'Importuj wydatki',
      addAndImport: 'Dodaj członków i importuj',
      importing: 'Importowanie...',
      analyzing: 'Analizowanie eksportu…',
      expenseCount:
        '{count, plural, one {Znaleziono # wydatek} few {Znaleziono # wydatki} other {Znaleziono # wydatków}}',
      matchedParticipants: 'Już w grupie: {names}',
      missingParticipantsLabel: 'Osoby do dodania do tej grupy',
      missingParticipantsDescription:
        'Podaj adres e-mail dla każdej osoby. Nowe konta są tworzone automatycznie i łączone z tą grupą. Jeśli osoby mają już konto, zostaną dodane jako członkowie.',
      expenseReferences:
        '{count, plural, one {# wydatek} few {# wydatki} other {# wydatków}}',
      emailLabel: 'E-mail',
      emailPlaceholder: 'imie@example.com',
      softCreateHint:
        'Mogą zarejestrować się później przy użyciu tego e-maila, aby uzyskać dostęp do grupy.',
      toast: {
        invalidFileType: {
          title: 'Nieprawidłowy typ pliku',
          description: 'Wybierz plik eksportu Knots w formacie JSON lub CSV.',
        },
        noContent: {
          title: 'Brak zawartości pliku',
          description: 'Najpierw wybierz plik eksportu Knots.',
        },
        missingEmail: {
          title: 'E-mail jest wymagany',
          description: 'Podaj e-mail dla {name}.',
        },
        success: {
          title: 'Import zakończony',
          description: 'Pomyślnie zaimportowano {count} wydatków z Knots.',
        },
        error: {
          title: 'Import nie powiódł się',
          description: 'Nie udało się zaimportować pliku eksportu Knots.',
        },
        cancelled: {
          title: 'Import anulowany',
          description: 'Import został zatrzymany przed zakończeniem.',
        },
      },
    },
    SplitwiseImport: {
      toast: {
        cancelled: {
          title: 'Import anulowany',
          description: 'Import został zatrzymany przed zakończeniem.',
        },
      },
    },
    MyGroups: {
      leaveGroupSuccess: 'Opuściłeś „{name}”.',
      activeGroups: 'Aktywne grupy',
      archivedGroups: 'Zarchiwizowane grupy',
      archiveSuccess: 'Grupa zarchiwizowana.',
      unarchiveSuccess: 'Grupa przywrócona.',
      deleteGroup: 'Usuń grupę',
      deleteSuccess: 'Grupa usunięta.',
      deleteGroupConfirmTitle: 'Usunąć grupę trwale?',
      deleteGroupConfirmDescription:
        'Spowoduje to trwałe usunięcie „{name}” oraz wszystkich jej wydatków, sald i historii dla wszystkich członków. Tej operacji nie można cofnąć.',
      deleteGroupConfirmCancel: 'Anuluj',
      deleteGroupConfirmAction: 'Usuń trwale',
    },
    GroupDangerZone: {
      title: 'Zarządzanie grupą',
      description:
        'Archiwizacja ukrywa tę grupę na liście bez usuwania danych. Usunięcie trwale usuwa grupę dla wszystkich.',
      archive: 'Zarchiwizuj grupę',
      unarchive: 'Przywróć grupę',
      delete: 'Usuń grupę',
      archiveSuccess: 'Grupa zarchiwizowana.',
      unarchiveSuccess: 'Grupa przywrócona.',
      deleteSuccess: 'Grupa usunięta.',
      deleteConfirmTitle: 'Usunąć grupę trwale?',
      deleteConfirmDescription:
        'Spowoduje to trwałe usunięcie „{name}” oraz wszystkich jej wydatków, sald i historii dla wszystkich członków. Tej operacji nie można cofnąć.',
      cancel: 'Anuluj',
      deleteConfirmAction: 'Usuń trwale',
    },
  },
  'pt-BR': {
    ExpenseImport: {
      button: 'Importar despesas',
      fromKnots: 'Importar do Knots',
      fromSplitwise: 'Importar do Splitwise',
    },
    KnotsImport: {
      title: 'Importar do Knots',
      description:
        'Envie um arquivo exportado do Knots. Se o arquivo incluir pessoas que ainda não estão neste grupo, você pode adicioná-las aqui antes de importar.',
      fileLabel: 'Arquivo de exportação do Knots',
      previewLabel: 'Prévia (primeiras 10 linhas)',
      clear: 'Limpar',
      cancel: 'Cancelar',
      import: 'Importar despesas',
      addAndImport: 'Adicionar membros e importar',
      importing: 'Importando...',
      analyzing: 'Analisando exportação…',
      expenseCount:
        '{count, plural, one {# despesa encontrada} other {# despesas encontradas}}',
      matchedParticipants: 'Já no grupo: {names}',
      missingParticipantsLabel: 'Pessoas para adicionar a este grupo',
      missingParticipantsDescription:
        'Informe um e-mail para cada pessoa. Novas contas são criadas automaticamente e vinculadas a este grupo. Se elas já tiverem uma conta, serão adicionadas como membros.',
      expenseReferences: '{count, plural, one {# despesa} other {# despesas}}',
      emailLabel: 'E-mail',
      emailPlaceholder: 'nome@example.com',
      softCreateHint:
        'Elas poderão se cadastrar depois com este e-mail para acessar o grupo.',
      toast: {
        invalidFileType: {
          title: 'Tipo de arquivo inválido',
          description: 'Selecione um arquivo JSON ou CSV exportado do Knots.',
        },
        noContent: {
          title: 'Arquivo sem conteúdo',
          description: 'Selecione primeiro um arquivo de exportação do Knots.',
        },
        missingEmail: {
          title: 'E-mail obrigatório',
          description: 'Informe o e-mail de {name}.',
        },
        success: {
          title: 'Importação concluída',
          description: '{count} despesas importadas com sucesso do Knots.',
        },
        error: {
          title: 'Falha na importação',
          description: 'Não foi possível importar o arquivo do Knots.',
        },
        cancelled: {
          title: 'Importação cancelada',
          description: 'A importação foi interrompida antes de terminar.',
        },
      },
    },
    SplitwiseImport: {
      toast: {
        cancelled: {
          title: 'Importação cancelada',
          description: 'A importação foi interrompida antes de terminar.',
        },
      },
    },
    MyGroups: {
      leaveGroupSuccess: 'Você saiu de “{name}”.',
      activeGroups: 'Grupos ativos',
      archivedGroups: 'Grupos arquivados',
      archiveSuccess: 'Grupo arquivado.',
      unarchiveSuccess: 'Grupo restaurado.',
      deleteGroup: 'Excluir grupo',
      deleteSuccess: 'Grupo excluído.',
      deleteGroupConfirmTitle: 'Excluir grupo permanentemente?',
      deleteGroupConfirmDescription:
        'Isso excluirá permanentemente “{name}” e todas as suas despesas, saldos e histórico para todos os membros. Esta ação não pode ser desfeita.',
      deleteGroupConfirmCancel: 'Cancelar',
      deleteGroupConfirmAction: 'Excluir permanentemente',
    },
    GroupDangerZone: {
      title: 'Gerenciamento do grupo',
      description:
        'Arquivar oculta este grupo da sua lista sem apagar dados. Excluir remove permanentemente o grupo para todos.',
      archive: 'Arquivar grupo',
      unarchive: 'Restaurar grupo',
      delete: 'Excluir grupo',
      archiveSuccess: 'Grupo arquivado.',
      unarchiveSuccess: 'Grupo restaurado.',
      deleteSuccess: 'Grupo excluído.',
      deleteConfirmTitle: 'Excluir grupo permanentemente?',
      deleteConfirmDescription:
        'Isso excluirá permanentemente “{name}” e todas as suas despesas, saldos e histórico para todos os membros. Esta ação não pode ser desfeita.',
      cancel: 'Cancelar',
      deleteConfirmAction: 'Excluir permanentemente',
    },
  },
  ro: {
    ExpenseImport: {
      button: 'Importă cheltuieli',
      fromKnots: 'Importă din Knots',
      fromSplitwise: 'Importă din Splitwise',
    },
    KnotsImport: {
      title: 'Importă din Knots',
      description:
        'Încarcă un fișier exportat din Knots. Dacă fișierul include persoane care nu sunt încă în acest grup, le poți adăuga aici înainte de import.',
      fileLabel: 'Fișier de export Knots',
      previewLabel: 'Previzualizare (primele 10 rânduri)',
      clear: 'Șterge',
      cancel: 'Anulează',
      import: 'Importă cheltuieli',
      addAndImport: 'Adaugă membri și importă',
      importing: 'Se importă...',
      analyzing: 'Se analizează exportul…',
      expenseCount:
        '{count, plural, one {# cheltuială găsită} few {# cheltuieli găsite} other {# de cheltuieli găsite}}',
      matchedParticipants: 'Deja în grup: {names}',
      missingParticipantsLabel: 'Persoane de adăugat în acest grup',
      missingParticipantsDescription:
        'Introdu un e-mail pentru fiecare persoană. Conturile noi sunt create automat și asociate cu acest grup. Dacă au deja un cont, sunt adăugate ca membri.',
      expenseReferences:
        '{count, plural, one {# cheltuială} few {# cheltuieli} other {# de cheltuieli}}',
      emailLabel: 'E-mail',
      emailPlaceholder: 'nume@example.com',
      softCreateHint:
        'Se pot înregistra mai târziu cu acest e-mail pentru a accesa grupul.',
      toast: {
        invalidFileType: {
          title: 'Tip de fișier nevalid',
          description:
            'Selectează un fișier de export Knots în format JSON sau CSV.',
        },
        noContent: {
          title: 'Fișier fără conținut',
          description: 'Selectează mai întâi un fișier de export Knots.',
        },
        missingEmail: {
          title: 'E-mail obligatoriu',
          description: 'Introdu e-mailul pentru {name}.',
        },
        success: {
          title: 'Import reușit',
          description:
            'Au fost importate cu succes {count} cheltuieli din Knots.',
        },
        error: {
          title: 'Import eșuat',
          description: 'Nu s-a putut importa fișierul de export Knots.',
        },
        cancelled: {
          title: 'Import anulat',
          description: 'Importul a fost oprit înainte să se termine.',
        },
      },
    },
    SplitwiseImport: {
      toast: {
        cancelled: {
          title: 'Import anulat',
          description: 'Importul a fost oprit înainte să se termine.',
        },
      },
    },
    MyGroups: {
      leaveGroupSuccess: 'Ai părăsit „{name}”.',
      activeGroups: 'Grupuri active',
      archivedGroups: 'Grupuri arhivate',
      archiveSuccess: 'Grup arhivat.',
      unarchiveSuccess: 'Grup restaurat.',
      deleteGroup: 'Șterge grupul',
      deleteSuccess: 'Grup șters.',
      deleteGroupConfirmTitle: 'Ștergi grupul definitiv?',
      deleteGroupConfirmDescription:
        'Aceasta va șterge definitiv „{name}” și toate cheltuielile, soldurile și istoricul său pentru toți membrii. Acțiunea nu poate fi anulată.',
      deleteGroupConfirmCancel: 'Anulează',
      deleteGroupConfirmAction: 'Șterge definitiv',
    },
    GroupDangerZone: {
      title: 'Administrarea grupului',
      description:
        'Arhivarea ascunde acest grup din lista ta fără a șterge datele. Ștergerea elimină definitiv grupul pentru toată lumea.',
      archive: 'Arhivează grupul',
      unarchive: 'Restaurează grupul',
      delete: 'Șterge grupul',
      archiveSuccess: 'Grup arhivat.',
      unarchiveSuccess: 'Grup restaurat.',
      deleteSuccess: 'Grup șters.',
      deleteConfirmTitle: 'Ștergi grupul definitiv?',
      deleteConfirmDescription:
        'Aceasta va șterge definitiv „{name}” și toate cheltuielile, soldurile și istoricul său pentru toți membrii. Acțiunea nu poate fi anulată.',
      cancel: 'Anulează',
      deleteConfirmAction: 'Șterge definitiv',
    },
  },
  'ru-RU': {
    ExpenseImport: {
      button: 'Импортировать расходы',
      fromKnots: 'Импортировать из Knots',
      fromSplitwise: 'Импортировать из Splitwise',
    },
    KnotsImport: {
      title: 'Импорт из Knots',
      description:
        'Загрузите файл экспорта Knots. Если в файле есть люди, которых еще нет в этой группе, вы можете добавить их здесь перед импортом.',
      fileLabel: 'Файл экспорта Knots',
      previewLabel: 'Предпросмотр (первые 10 строк)',
      clear: 'Очистить',
      cancel: 'Отмена',
      import: 'Импортировать расходы',
      addAndImport: 'Добавить участников и импортировать',
      importing: 'Импорт...',
      analyzing: 'Анализ экспорта…',
      expenseCount:
        '{count, plural, one {Найден # расход} few {Найдено # расхода} many {Найдено # расходов} other {Найдено # расхода}}',
      matchedParticipants: 'Уже в группе: {names}',
      missingParticipantsLabel: 'Люди для добавления в эту группу',
      missingParticipantsDescription:
        'Введите e-mail для каждого человека. Новые аккаунты создаются автоматически и связываются с этой группой. Если аккаунт уже есть, человек будет добавлен как участник.',
      expenseReferences:
        '{count, plural, one {# расход} few {# расхода} many {# расходов} other {# расхода}}',
      emailLabel: 'E-mail',
      emailPlaceholder: 'name@example.com',
      softCreateHint:
        'Позже они смогут зарегистрироваться с этим e-mail, чтобы получить доступ к группе.',
      toast: {
        invalidFileType: {
          title: 'Недопустимый тип файла',
          description: 'Выберите файл экспорта Knots в формате JSON или CSV.',
        },
        noContent: {
          title: 'Нет содержимого файла',
          description: 'Сначала выберите файл экспорта Knots.',
        },
        missingEmail: {
          title: 'Требуется e-mail',
          description: 'Введите e-mail для {name}.',
        },
        success: {
          title: 'Импорт завершен',
          description: 'Успешно импортировано {count} расходов из Knots.',
        },
        error: {
          title: 'Ошибка импорта',
          description: 'Не удалось импортировать файл экспорта Knots.',
        },
        cancelled: {
          title: 'Импорт отменен',
          description: 'Импорт был остановлен до завершения.',
        },
      },
    },
    SplitwiseImport: {
      toast: {
        cancelled: {
          title: 'Импорт отменен',
          description: 'Импорт был остановлен до завершения.',
        },
      },
    },
    MyGroups: {
      leaveGroupSuccess: 'Вы покинули «{name}».',
      activeGroups: 'Активные группы',
      archivedGroups: 'Архивированные группы',
      archiveSuccess: 'Группа архивирована.',
      unarchiveSuccess: 'Группа восстановлена.',
      deleteGroup: 'Удалить группу',
      deleteSuccess: 'Группа удалена.',
      deleteGroupConfirmTitle: 'Удалить группу навсегда?',
      deleteGroupConfirmDescription:
        'Это навсегда удалит «{name}» и все ее расходы, балансы и историю для всех участников. Это действие нельзя отменить.',
      deleteGroupConfirmCancel: 'Отмена',
      deleteGroupConfirmAction: 'Удалить навсегда',
    },
    GroupDangerZone: {
      title: 'Управление группой',
      description:
        'Архивация скрывает эту группу из вашего списка без удаления данных. Удаление навсегда удаляет группу для всех.',
      archive: 'Архивировать группу',
      unarchive: 'Восстановить группу',
      delete: 'Удалить группу',
      archiveSuccess: 'Группа архивирована.',
      unarchiveSuccess: 'Группа восстановлена.',
      deleteSuccess: 'Группа удалена.',
      deleteConfirmTitle: 'Удалить группу навсегда?',
      deleteConfirmDescription:
        'Это навсегда удалит «{name}» и все ее расходы, балансы и историю для всех участников. Это действие нельзя отменить.',
      cancel: 'Отмена',
      deleteConfirmAction: 'Удалить навсегда',
    },
  },
  'tr-TR': {
    ExpenseImport: {
      button: 'Giderleri içe aktar',
      fromKnots: 'Knots’tan içe aktar',
      fromSplitwise: 'Splitwise’dan içe aktar',
    },
    KnotsImport: {
      title: 'Knots’tan içe aktar',
      description:
        'Bir Knots dışa aktarma dosyası yükleyin. Dosyada henüz bu grupta olmayan kişiler varsa, içe aktarmadan önce onları burada ekleyebilirsiniz.',
      fileLabel: 'Knots dışa aktarma dosyası',
      previewLabel: 'Önizleme (ilk 10 satır)',
      clear: 'Temizle',
      cancel: 'İptal',
      import: 'Giderleri içe aktar',
      addAndImport: 'Üyeleri ekle ve içe aktar',
      importing: 'İçe aktarılıyor...',
      analyzing: 'Dışa aktarma analiz ediliyor…',
      expenseCount:
        '{count, plural, one {# gider bulundu} other {# gider bulundu}}',
      matchedParticipants: 'Zaten grupta: {names}',
      missingParticipantsLabel: 'Bu gruba eklenecek kişiler',
      missingParticipantsDescription:
        'Her kişi için bir e-posta girin. Yeni hesaplar otomatik olarak oluşturulur ve bu gruba bağlanır. Zaten hesapları varsa üye olarak eklenirler.',
      expenseReferences: '{count, plural, one {# gider} other {# gider}}',
      emailLabel: 'E-posta',
      emailPlaceholder: 'ad@example.com',
      softCreateHint: 'Daha sonra bu e-posta ile kaydolup gruba erişebilirler.',
      toast: {
        invalidFileType: {
          title: 'Geçersiz dosya türü',
          description: 'Lütfen JSON veya CSV Knots dışa aktarma dosyası seçin.',
        },
        noContent: {
          title: 'Dosya içeriği yok',
          description: 'Lütfen önce bir Knots dışa aktarma dosyası seçin.',
        },
        missingEmail: {
          title: 'E-posta gerekli',
          description: '{name} için bir e-posta girin.',
        },
        success: {
          title: 'İçe aktarma başarılı',
          description: 'Knots’tan {count} gider başarıyla içe aktarıldı.',
        },
        error: {
          title: 'İçe aktarma başarısız',
          description: 'Knots dışa aktarma dosyası içe aktarılamadı.',
        },
        cancelled: {
          title: 'İçe aktarma iptal edildi',
          description: 'İçe aktarma tamamlanmadan durduruldu.',
        },
      },
    },
    SplitwiseImport: {
      toast: {
        cancelled: {
          title: 'İçe aktarma iptal edildi',
          description: 'İçe aktarma tamamlanmadan durduruldu.',
        },
      },
    },
    MyGroups: {
      leaveGroupSuccess: '“{name}” grubundan ayrıldınız.',
      activeGroups: 'Aktif gruplar',
      archivedGroups: 'Arşivlenmiş gruplar',
      archiveSuccess: 'Grup arşivlendi.',
      unarchiveSuccess: 'Grup geri yüklendi.',
      deleteGroup: 'Grubu sil',
      deleteSuccess: 'Grup silindi.',
      deleteGroupConfirmTitle: 'Grup kalıcı olarak silinsin mi?',
      deleteGroupConfirmDescription:
        'Bu işlem “{name}” grubunu ve tüm giderlerini, bakiyelerini ve geçmişini herkes için kalıcı olarak siler. Bu işlem geri alınamaz.',
      deleteGroupConfirmCancel: 'İptal',
      deleteGroupConfirmAction: 'Kalıcı olarak sil',
    },
    GroupDangerZone: {
      title: 'Grup yönetimi',
      description:
        'Arşivleme, verileri silmeden bu grubu listenizden gizler. Silme, grubu herkes için kalıcı olarak kaldırır.',
      archive: 'Grubu arşivle',
      unarchive: 'Grubu geri yükle',
      delete: 'Grubu sil',
      archiveSuccess: 'Grup arşivlendi.',
      unarchiveSuccess: 'Grup geri yüklendi.',
      deleteSuccess: 'Grup silindi.',
      deleteConfirmTitle: 'Grup kalıcı olarak silinsin mi?',
      deleteConfirmDescription:
        'Bu işlem “{name}” grubunu ve tüm giderlerini, bakiyelerini ve geçmişini herkes için kalıcı olarak siler. Bu işlem geri alınamaz.',
      cancel: 'İptal',
      deleteConfirmAction: 'Kalıcı olarak sil',
    },
  },
  'ua-UA': {
    ExpenseImport: {
      button: 'Імпортувати витрати',
      fromKnots: 'Імпортувати з Knots',
      fromSplitwise: 'Імпортувати зі Splitwise',
    },
    KnotsImport: {
      title: 'Імпорт з Knots',
      description:
        'Завантажте файл експорту Knots. Якщо файл містить людей, яких ще немає в цій групі, ви можете додати їх тут перед імпортом.',
      fileLabel: 'Файл експорту Knots',
      previewLabel: 'Попередній перегляд (перші 10 рядків)',
      clear: 'Очистити',
      cancel: 'Скасувати',
      import: 'Імпортувати витрати',
      addAndImport: 'Додати учасників та імпортувати',
      importing: 'Імпортування...',
      analyzing: 'Аналіз експорту…',
      expenseCount:
        '{count, plural, one {Знайдено # витрату} few {Знайдено # витрати} many {Знайдено # витрат} other {Знайдено # витрати}}',
      matchedParticipants: 'Уже в групі: {names}',
      missingParticipantsLabel: 'Люди для додавання до цієї групи',
      missingParticipantsDescription:
        'Введіть e-mail для кожної людини. Нові облікові записи створюються автоматично та прив’язуються до цієї групи. Якщо обліковий запис уже існує, людину буде додано як учасника.',
      expenseReferences:
        '{count, plural, one {# витрата} few {# витрати} many {# витрат} other {# витрати}}',
      emailLabel: 'E-mail',
      emailPlaceholder: 'name@example.com',
      softCreateHint:
        'Пізніше вони зможуть зареєструватися з цим e-mail, щоб отримати доступ до групи.',
      toast: {
        invalidFileType: {
          title: 'Недійсний тип файлу',
          description: 'Виберіть файл експорту Knots у форматі JSON або CSV.',
        },
        noContent: {
          title: 'Немає вмісту файлу',
          description: 'Спочатку виберіть файл експорту Knots.',
        },
        missingEmail: {
          title: 'Потрібен e-mail',
          description: 'Введіть e-mail для {name}.',
        },
        success: {
          title: 'Імпорт успішний',
          description: 'Успішно імпортовано {count} витрат з Knots.',
        },
        error: {
          title: 'Помилка імпорту',
          description: 'Не вдалося імпортувати файл експорту Knots.',
        },
        cancelled: {
          title: 'Імпорт скасовано',
          description: 'Імпорт було зупинено до завершення.',
        },
      },
    },
    SplitwiseImport: {
      toast: {
        cancelled: {
          title: 'Імпорт скасовано',
          description: 'Імпорт було зупинено до завершення.',
        },
      },
    },
    MyGroups: {
      leaveGroupSuccess: 'Ви залишили «{name}».',
      activeGroups: 'Активні групи',
      archivedGroups: 'Архівовані групи',
      archiveSuccess: 'Групу заархівовано.',
      unarchiveSuccess: 'Групу відновлено.',
      deleteGroup: 'Видалити групу',
      deleteSuccess: 'Групу видалено.',
      deleteGroupConfirmTitle: 'Видалити групу назавжди?',
      deleteGroupConfirmDescription:
        'Це назавжди видалить «{name}» і всі її витрати, баланси та історію для всіх учасників. Цю дію не можна скасувати.',
      deleteGroupConfirmCancel: 'Скасувати',
      deleteGroupConfirmAction: 'Видалити назавжди',
    },
    GroupDangerZone: {
      title: 'Керування групою',
      description:
        'Архівування приховує цю групу з вашого списку без видалення даних. Видалення назавжди прибирає групу для всіх.',
      archive: 'Заархівувати групу',
      unarchive: 'Відновити групу',
      delete: 'Видалити групу',
      archiveSuccess: 'Групу заархівовано.',
      unarchiveSuccess: 'Групу відновлено.',
      deleteSuccess: 'Групу видалено.',
      deleteConfirmTitle: 'Видалити групу назавжди?',
      deleteConfirmDescription:
        'Це назавжди видалить «{name}» і всі її витрати, баланси та історію для всіх учасників. Цю дію не можна скасувати.',
      cancel: 'Скасувати',
      deleteConfirmAction: 'Видалити назавжди',
    },
  },
  'zh-CN': {
    ExpenseImport: {
      button: '导入支出',
      fromKnots: '从 Knots 导入',
      fromSplitwise: '从 Splitwise 导入',
    },
    KnotsImport: {
      title: '从 Knots 导入',
      description:
        '上传 Knots 导出文件。如果文件包含尚未加入此群组的人员，你可以在导入前先在这里添加他们。',
      fileLabel: 'Knots 导出文件',
      previewLabel: '预览（前 10 行）',
      clear: '清除',
      cancel: '取消',
      import: '导入支出',
      addAndImport: '添加成员并导入',
      importing: '正在导入...',
      analyzing: '正在分析导出文件…',
      expenseCount:
        '{count, plural, one {找到 # 笔支出} other {找到 # 笔支出}}',
      matchedParticipants: '已在群组中：{names}',
      missingParticipantsLabel: '要添加到此群组的人员',
      missingParticipantsDescription:
        '为每个人输入电子邮件。新账户会自动创建并关联到此群组。如果他们已有账户，则会被添加为成员。',
      expenseReferences: '{count, plural, one {# 笔支出} other {# 笔支出}}',
      emailLabel: '电子邮件',
      emailPlaceholder: 'name@example.com',
      softCreateHint: '他们稍后可以使用此电子邮件注册以访问该群组。',
      toast: {
        invalidFileType: {
          title: '文件类型无效',
          description: '请选择 JSON 或 CSV 格式的 Knots 导出文件。',
        },
        noContent: {
          title: '文件没有内容',
          description: '请先选择一个 Knots 导出文件。',
        },
        missingEmail: {
          title: '需要电子邮件',
          description: '请输入 {name} 的电子邮件。',
        },
        success: {
          title: '导入成功',
          description: '已成功从 Knots 导入 {count} 笔支出。',
        },
        error: {
          title: '导入失败',
          description: '无法导入 Knots 导出文件。',
        },
        cancelled: {
          title: '导入已取消',
          description: '导入在完成前已停止。',
        },
      },
    },
    SplitwiseImport: {
      toast: {
        cancelled: {
          title: '导入已取消',
          description: '导入在完成前已停止。',
        },
      },
    },
    MyGroups: {
      leaveGroupSuccess: '你已离开“{name}”。',
      activeGroups: '活跃群组',
      archivedGroups: '已归档群组',
      archiveSuccess: '群组已归档。',
      unarchiveSuccess: '群组已恢复。',
      deleteGroup: '删除群组',
      deleteSuccess: '群组已删除。',
      deleteGroupConfirmTitle: '永久删除群组？',
      deleteGroupConfirmDescription:
        '这将为所有成员永久删除“{name}”及其所有支出、余额和历史记录。此操作无法撤销。',
      deleteGroupConfirmCancel: '取消',
      deleteGroupConfirmAction: '永久删除',
    },
    GroupDangerZone: {
      title: '群组管理',
      description:
        '归档会将此群组从你的列表中隐藏，但不会删除数据。删除会为所有人永久移除此群组。',
      archive: '归档群组',
      unarchive: '恢复群组',
      delete: '删除群组',
      archiveSuccess: '群组已归档。',
      unarchiveSuccess: '群组已恢复。',
      deleteSuccess: '群组已删除。',
      deleteConfirmTitle: '永久删除群组？',
      deleteConfirmDescription:
        '这将为所有成员永久删除“{name}”及其所有支出、余额和历史记录。此操作无法撤销。',
      cancel: '取消',
      deleteConfirmAction: '永久删除',
    },
  },
  'zh-TW': {
    ExpenseImport: {
      button: '匯入支出',
      fromKnots: '從 Knots 匯入',
      fromSplitwise: '從 Splitwise 匯入',
    },
    KnotsImport: {
      title: '從 Knots 匯入',
      description:
        '上傳 Knots 匯出檔案。如果檔案包含尚未加入此群組的人員，你可以在匯入前先在這裡新增他們。',
      fileLabel: 'Knots 匯出檔案',
      previewLabel: '預覽（前 10 行）',
      clear: '清除',
      cancel: '取消',
      import: '匯入支出',
      addAndImport: '新增成員並匯入',
      importing: '正在匯入...',
      analyzing: '正在分析匯出檔…',
      expenseCount:
        '{count, plural, one {找到 # 筆支出} other {找到 # 筆支出}}',
      matchedParticipants: '已在群組中：{names}',
      missingParticipantsLabel: '要新增到此群組的人員',
      missingParticipantsDescription:
        '為每個人輸入電子郵件。新帳號會自動建立並連結到此群組。如果他們已經有帳號，則會被新增為成員。',
      expenseReferences: '{count, plural, one {# 筆支出} other {# 筆支出}}',
      emailLabel: '電子郵件',
      emailPlaceholder: 'name@example.com',
      softCreateHint: '他們之後可以使用此電子郵件註冊以存取群組。',
      toast: {
        invalidFileType: {
          title: '檔案類型無效',
          description: '請選擇 JSON 或 CSV 格式的 Knots 匯出檔案。',
        },
        noContent: {
          title: '檔案沒有內容',
          description: '請先選擇 Knots 匯出檔案。',
        },
        missingEmail: {
          title: '需要電子郵件',
          description: '請輸入 {name} 的電子郵件。',
        },
        success: {
          title: '匯入成功',
          description: '已成功從 Knots 匯入 {count} 筆支出。',
        },
        error: {
          title: '匯入失敗',
          description: '無法匯入 Knots 匯出檔案。',
        },
        cancelled: {
          title: '匯入已取消',
          description: '匯入在完成前已停止。',
        },
      },
    },
    SplitwiseImport: {
      toast: {
        cancelled: {
          title: '匯入已取消',
          description: '匯入在完成前已停止。',
        },
      },
    },
    MyGroups: {
      leaveGroupSuccess: '你已離開「{name}」。',
      activeGroups: '啟用中的群組',
      archivedGroups: '已封存群組',
      archiveSuccess: '群組已封存。',
      unarchiveSuccess: '群組已還原。',
      deleteGroup: '刪除群組',
      deleteSuccess: '群組已刪除。',
      deleteGroupConfirmTitle: '永久刪除群組？',
      deleteGroupConfirmDescription:
        '這會為所有成員永久刪除「{name}」及其所有支出、餘額和歷史紀錄。此操作無法復原。',
      deleteGroupConfirmCancel: '取消',
      deleteGroupConfirmAction: '永久刪除',
    },
    GroupDangerZone: {
      title: '群組管理',
      description:
        '封存會將此群組從你的清單中隱藏，但不會刪除資料。刪除會為所有人永久移除此群組。',
      archive: '封存群組',
      unarchive: '還原群組',
      delete: '刪除群組',
      archiveSuccess: '群組已封存。',
      unarchiveSuccess: '群組已還原。',
      deleteSuccess: '群組已刪除。',
      deleteConfirmTitle: '永久刪除群組？',
      deleteConfirmDescription:
        '這會為所有成員永久刪除「{name}」及其所有支出、餘額和歷史紀錄。此操作無法復原。',
      cancel: '取消',
      deleteConfirmAction: '永久刪除',
    },
  },
}

function main() {
  for (const [locale, patch] of Object.entries(PATCHES)) {
    const file = `${locale}.json`
    const filePath = path.join(MESSAGES_DIR, file)
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'))

    deepMerge(data, patch)

    fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`)
    console.log(`Updated ${file}`)
  }
}

main()
