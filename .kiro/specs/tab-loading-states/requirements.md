# Requirements Document

## Introduction

Quando o utilizador navega entre páginas na aplicação Knots (incluindo mudanças de tab dentro de um grupo, navegação para páginas de criação/edição, ou qualquer outra transição de rota), o ecrã parece "congelado" sem indicação clara de que algo está a acontecer. Embora exista uma barra de progresso fina no topo (2px, via `next13-progressbar`), esta não é suficientemente visível para comunicar ao utilizador que a aplicação está ocupada. Esta feature introduz estados de carregamento visuais mais evidentes na área de conteúdo principal, dando feedback claro durante transições de página.

## Glossary

- **Page_Navigation**: Qualquer transição de rota na aplicação, incluindo mudanças de tab, navegação para sub-páginas, ou navegação entre secções principais
- **Content_Area**: A área principal da página (`<main>`) onde o conteúdo dinâmico é renderizado
- **Loading_State**: O estado visual apresentado na Content_Area durante o período entre o início da navegação e a renderização completa da nova página
- **Skeleton_Placeholder**: Elemento visual com forma semelhante ao conteúdo final que apresenta uma animação de pulso para indicar carregamento
- **Transition_Period**: O intervalo de tempo entre o início de uma Page_Navigation e a renderização completa do conteúdo de destino
- **Progress_Bar**: A barra de progresso existente no topo da aplicação (2px, cor slate)

## Requirements

### Requisito 1: Indicação visual de carregamento na área de conteúdo

**User Story:** Como utilizador, quero ver uma indicação visual clara na área de conteúdo quando navego entre páginas, para que saiba que a aplicação está a processar o meu pedido e não está "congelada".

#### Critérios de Aceitação

1. WHEN uma Page_Navigation é iniciada, THE Content_Area SHALL apresentar um Loading_State que ocupe no mínimo 48x48 píxeis dentro do viewport visível, com um contraste mínimo de 3:1 face ao fundo, e que seja anunciado a tecnologias assistivas através de um atributo aria-busy="true" na Content_Area
2. WHEN o conteúdo da página de destino termina de carregar, THE Content_Area SHALL substituir o Loading_State pelo conteúdo real no máximo em 100ms após o conteúdo estar pronto para renderização
3. IF o Transition_Period é inferior a 200ms, THEN THE Content_Area SHALL apresentar o conteúdo diretamente sem mostrar Loading_State
4. IF o Transition_Period exceder 10 segundos sem que o conteúdo da página de destino termine de carregar, THEN THE Content_Area SHALL remover o Loading_State e apresentar uma mensagem de erro indicando que o carregamento falhou, permitindo ao utilizador tentar novamente

### Requisito 2: Skeleton placeholders contextuais

**User Story:** Como utilizador, quero que os placeholders de carregamento representem a estrutura do conteúdo que vou ver, para que a transição seja suave e previsível.

#### Critérios de Aceitação

1. WHILE a Content_Area está em Loading_State para a tab "expenses" ou "activity", THE Skeleton_Placeholder SHALL apresentar um mínimo de 3 elementos em formato de item de lista (linhas horizontais empilhadas verticalmente) representando a lista de itens da página de destino
2. WHILE a Content_Area está em Loading_State para a tab "balances" ou "information", THE Skeleton_Placeholder SHALL apresentar elementos em formato de card (blocos retangulares) representando os cards de resumo da página de destino
3. WHILE a Content_Area está em Loading_State para a tab "stats", THE Skeleton_Placeholder SHALL apresentar elementos em formato de bloco retangular representando os gráficos e totais da página de destino
4. WHILE o Skeleton_Placeholder está visível, THE Skeleton_Placeholder SHALL apresentar uma animação de pulso com ciclo contínuo para comunicar atividade ao utilizador
5. WHEN o conteúdo da página de destino termina de renderizar, THE Content_Area SHALL substituir o Skeleton_Placeholder pelo conteúdo final sem provocar alteração da posição vertical dos elementos adjacentes (sem layout shift)
6. WHERE uma página não tem um Skeleton_Placeholder específico definido, THE Content_Area SHALL apresentar um Loading_State genérico composto por no mínimo 3 skeletons de linha e 1 skeleton de bloco

### Requisito 3: Consistência visual com o design existente

**User Story:** Como utilizador, quero que os estados de carregamento sejam visualmente consistentes com o resto da aplicação, para que a experiência seja coesa.

#### Critérios de Aceitação

1. THE Skeleton_Placeholder SHALL ser composto exclusivamente por instâncias do componente Skeleton existente na biblioteca de UI do projeto, sem introduzir novos componentes visuais de carregamento
2. WHEN o tema ativo muda entre claro e escuro, THE Loading_State SHALL adaptar as suas cores automaticamente através dos tokens de design do tema (sem necessidade de configuração adicional por parte do programador)
3. WHILE a Loading_State é apresentada, THE layout SHALL manter o header e a navegação renderizados e visíveis nas suas posições originais, sem alteração de dimensões ou posição, de modo que apenas a Content_Area apresente o Skeleton_Placeholder
4. THE Skeleton_Placeholder SHALL ocupar dimensões (largura e altura) aproximadas às do conteúdo final que substitui, de forma que a transição entre o estado de carregamento e o conteúdo renderizado não provoque deslocamento visível dos elementos circundantes (CLS igual a 0)

### Requisito 4: Navegação funcional durante o carregamento

**User Story:** Como utilizador, quero poder navegar para outra página mesmo enquanto a atual ainda está a carregar, para que não fique bloqueado à espera.

#### Critérios de Aceitação

1. WHILE a Content_Area está em Loading_State, THE Page_Navigation SHALL permanecer clicável e responder a interações do utilizador sem atraso percetível (dentro de 100ms após o clique)
2. WHEN o utilizador inicia uma nova Page_Navigation enquanto uma navegação anterior ainda está em Loading_State, THE Content_Area SHALL cancelar o carregamento da navegação anterior e apresentar imediatamente o Loading_State correspondente à nova navegação, independentemente de quantas navegações anteriores estejam pendentes
3. WHILE a Content_Area está em Loading_State, THE Page_Navigation SHALL apresentar os elementos de navegação no mesmo estado visual (não desativados, não esmaecidos) que apresenta quando nenhum carregamento está em curso

### Requisito 5: Acessibilidade dos estados de carregamento

**User Story:** Como utilizador com tecnologias assistivas, quero ser informado sobre estados de carregamento, para que saiba que conteúdo está a ser obtido.

#### Critérios de Aceitação

1. WHEN uma Page_Navigation é iniciada, THE Content_Area SHALL comunicar o estado de carregamento a tecnologias assistivas através do atributo aria-busy="true"
2. THE Skeleton_Placeholder SHALL incluir um atributo aria-label que identifique o tipo de conteúdo em carregamento (por exemplo, "A carregar lista de projetos") e os seus elementos visuais decorativos SHALL ser ocultados de tecnologias assistivas através de aria-hidden="true"
3. WHEN o conteúdo termina de carregar, THE Content_Area SHALL remover o atributo aria-busy para notificar tecnologias assistivas de que o conteúdo está disponível
4. IF uma Page_Navigation falha ou não completa dentro de 30 segundos, THEN THE Content_Area SHALL definir aria-busy="false" e comunicar o estado de erro a tecnologias assistivas através de uma região aria-live

### Requisito 6: Performance e limites temporais

**User Story:** Como utilizador, quero que os estados de carregamento não degradem a performance da aplicação, para que a experiência continue fluida.

#### Critérios de Aceitação

1. THE Loading_State SHALL utilizar exclusivamente animações CSS (não JavaScript) e manter uma taxa de renderização de pelo menos 60 frames por segundo durante a animação no Content_Area
2. IF o Transition_Period exceder 10 segundos, THEN THE Loading_State SHALL apresentar uma mensagem informando o utilizador de que o carregamento está a demorar mais do que o esperado
3. IF o Transition_Period exceder 30 segundos, THEN THE Loading_State SHALL apresentar uma opção que permita ao utilizador cancelar o carregamento ou tentar novamente a navegação
4. WHILE o Loading_State estiver visível no Content_Area, THE Loading_State SHALL permanecer abaixo da Progress_Bar na hierarquia visual, sem sobrepor, ocultar ou interromper a animação da Progress_Bar existente
