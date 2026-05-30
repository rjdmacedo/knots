# Bugfix Requirements Document

## Introduction

Inconsistência visual e de acessibilidade nos botões da aplicação. O botão "Import from Splitwise" utiliza corretamente os componentes shadcn `Tooltip`/`TooltipTrigger`/`TooltipContent`, enquanto os demais botões de ícone (share, notifications, export, create expense, create from receipt, edit group) usam apenas o atributo HTML `title` ou não possuem tooltip algum. Além disso, o card de grupo no menu de contexto não possui a opção de ativar/desativar notificações.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN the user hovers over the Share button in the group header THEN the system displays only a native HTML title tooltip (inconsistent with the Splitwise Import button which uses shadcn Tooltip)

1.2 WHEN the user hovers over the Notifications (bell) button in the group header THEN the system displays only a native HTML title tooltip (inconsistent with the Splitwise Import button)

1.3 WHEN the user hovers over the Export button in the expenses page THEN the system displays only a native HTML title tooltip (inconsistent with the Splitwise Import button)

1.4 WHEN the user hovers over the Create Expense (+) button in the expenses page THEN the system displays only a native HTML title tooltip (inconsistent with the Splitwise Import button)

1.5 WHEN the user hovers over the Create from Receipt button in the expenses page THEN the system displays only a native HTML title tooltip (inconsistent with the Splitwise Import button)

1.6 WHEN the user hovers over the Edit (pencil) button in the Information tab THEN the system does not display any tooltip or title attribute

1.7 WHEN the user opens the context menu on a group card THEN the system does not show an option to toggle notifications for that group

### Expected Behavior (Correct)

2.1 WHEN the user hovers over the Share button in the group header THEN the system SHALL display a shadcn Tooltip component with the localized label text

2.2 WHEN the user hovers over the Notifications (bell) button in the group header THEN the system SHALL display a shadcn Tooltip component with the localized subscribe/unsubscribe label

2.3 WHEN the user hovers over the Export button in the expenses page THEN the system SHALL display a shadcn Tooltip component with the localized "Export" label

2.4 WHEN the user hovers over the Create Expense (+) button in the expenses page THEN the system SHALL display a shadcn Tooltip component with the localized "Create expense" label

2.5 WHEN the user hovers over the Create from Receipt button in the expenses page THEN the system SHALL display a shadcn Tooltip component with the localized label

2.6 WHEN the user hovers over the Edit (pencil) button in the Information tab THEN the system SHALL display a shadcn Tooltip component with the localized "Edit" label

2.7 WHEN the user opens the context menu on a group card THEN the system SHALL show a "Toggle notifications" option that enables or disables push notifications for that group (all notifications, no granularity)

### Unchanged Behavior (Regression Prevention)

3.1 WHEN the user clicks the Share button THEN the system SHALL CONTINUE TO open the share popover with the group URL

3.2 WHEN the user clicks the Notifications button THEN the system SHALL CONTINUE TO open the notification dropdown with subscribe/unsubscribe and participant selection options

3.3 WHEN the user clicks the Export button THEN the system SHALL CONTINUE TO open the export dropdown with JSON and CSV options

3.4 WHEN the user clicks the Create Expense (+) button THEN the system SHALL CONTINUE TO navigate to the expense creation page

3.5 WHEN the user clicks the Create from Receipt button THEN the system SHALL CONTINUE TO open the receipt scanning dialog/drawer

3.6 WHEN the user clicks the Edit button in the Information tab THEN the system SHALL CONTINUE TO navigate to the group edit page

3.7 WHEN the user clicks "Remove from recent groups" or "Archive group" in the group card context menu THEN the system SHALL CONTINUE TO perform those actions as before

3.8 WHEN the Splitwise Import button is hovered THEN the system SHALL CONTINUE TO display its shadcn Tooltip correctly (reference implementation)
