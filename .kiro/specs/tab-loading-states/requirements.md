# Requirements Document

## Introduction

When the user navigates between pages in the Knots application (including tab changes within a group, navigation to create/edit pages, or any other route transition), the screen appears "frozen" with no clear indication that something is happening. Although a thin progress bar exists at the top (2px, via `next13-progressbar`), it is not visible enough to communicate to the user that the application is busy. This feature introduces more prominent visual loading states in the main content area, providing clear feedback during page transitions.

## Glossary

- **Page_Navigation**: Any route transition in the application, including tab changes, navigation to sub-pages, or navigation between main sections
- **Content_Area**: The main page area (`<main>`) where dynamic content is rendered
- **Loading_State**: The visual state displayed in the Content_Area during the period between the start of navigation and the complete rendering of the new page
- **Skeleton_Placeholder**: Visual element shaped like the final content that displays a pulse animation to indicate loading
- **Transition_Period**: The time interval between the start of a Page_Navigation and the complete rendering of the destination content
- **Progress_Bar**: The existing progress bar at the top of the application (2px, slate color)

## Requirements

### Requirement 1: Visual loading indication in the content area

**User Story:** As a user, I want to see a clear visual indication in the content area when navigating between pages, so that I know the application is processing my request and is not "frozen".

#### Acceptance Criteria

1. WHEN a Page_Navigation is initiated, THE Content_Area SHALL display a Loading_State that occupies at least 48x48 pixels within the visible viewport, with a minimum contrast of 3:1 against the background, and that is announced to assistive technologies via an aria-busy="true" attribute on the Content_Area
2. WHEN the destination page content finishes loading, THE Content_Area SHALL replace the Loading_State with the real content within at most 100ms after the content is ready to render
3. IF the Transition_Period is less than 200ms, THEN THE Content_Area SHALL display the content directly without showing Loading_State
4. IF the Transition_Period exceeds 10 seconds without the destination page content finishing loading, THEN THE Content_Area SHALL remove the Loading_State and display an error message indicating that loading failed, allowing the user to try again

### Requirement 2: Contextual skeleton placeholders

**User Story:** As a user, I want loading placeholders to represent the structure of the content I will see, so that the transition feels smooth and predictable.

#### Acceptance Criteria

1. WHILE the Content_Area is in Loading_State for the "expenses" or "activity" tab, THE Skeleton_Placeholder SHALL display at least 3 list-item elements (horizontally stacked lines) representing the destination page's item list
2. WHILE the Content_Area is in Loading_State for the "balances" or "information" tab, THE Skeleton_Placeholder SHALL display card-format elements (rectangular blocks) representing the destination page's summary cards
3. WHILE the Content_Area is in Loading_State for the "stats" tab, THE Skeleton_Placeholder SHALL display rectangular block elements representing the destination page's charts and totals
4. WHILE the Skeleton_Placeholder is visible, THE Skeleton_Placeholder SHALL display a continuous pulse animation to communicate activity to the user
5. WHEN the destination page content finishes rendering, THE Content_Area SHALL replace the Skeleton_Placeholder with the final content without causing vertical position changes in adjacent elements (no layout shift)
6. WHERE a page does not have a specific Skeleton_Placeholder defined, THE Content_Area SHALL display a generic Loading_State composed of at least 3 line skeletons and 1 block skeleton

### Requirement 3: Visual consistency with existing design

**User Story:** As a user, I want loading states to be visually consistent with the rest of the application, so that the experience feels cohesive.

#### Acceptance Criteria

1. THE Skeleton_Placeholder SHALL be composed exclusively of instances of the existing Skeleton component from the project's UI library, without introducing new visual loading components
2. WHEN the active theme switches between light and dark, THE Loading_State SHALL adapt its colors automatically through the theme design tokens (without additional configuration required from the developer)
3. WHILE Loading_State is displayed, THE layout SHALL keep the header and navigation rendered and visible in their original positions, without dimension or position changes, so that only the Content_Area displays the Skeleton_Placeholder
4. THE Skeleton_Placeholder SHALL occupy dimensions (width and height) approximate to the final content it replaces, so that the transition between loading state and rendered content does not cause visible displacement of surrounding elements (CLS equal to 0)

### Requirement 4: Functional navigation during loading

**User Story:** As a user, I want to be able to navigate to another page even while the current one is still loading, so that I am not blocked waiting.

#### Acceptance Criteria

1. WHILE the Content_Area is in Loading_State, THE Page_Navigation SHALL remain clickable and respond to user interactions without perceptible delay (within 100ms after click)
2. WHEN the user initiates a new Page_Navigation while a previous navigation is still in Loading_State, THE Content_Area SHALL cancel loading of the previous navigation and immediately display the Loading_State corresponding to the new navigation, regardless of how many previous navigations are pending
3. WHILE the Content_Area is in Loading_State, THE Page_Navigation SHALL display navigation elements in the same visual state (not disabled, not dimmed) as when no loading is in progress

### Requirement 5: Accessibility of loading states

**User Story:** As a user with assistive technologies, I want to be informed about loading states, so that I know content is being fetched.

#### Acceptance Criteria

1. WHEN a Page_Navigation is initiated, THE Content_Area SHALL communicate the loading state to assistive technologies via the aria-busy="true" attribute
2. THE Skeleton_Placeholder SHALL include an aria-label attribute identifying the type of content being loaded (for example, "Loading project list") and its decorative visual elements SHALL be hidden from assistive technologies via aria-hidden="true"
3. WHEN content finishes loading, THE Content_Area SHALL remove the aria-busy attribute to notify assistive technologies that content is available
4. IF a Page_Navigation fails or does not complete within 30 seconds, THEN THE Content_Area SHALL set aria-busy="false" and communicate the error state to assistive technologies via an aria-live region

### Requirement 6: Performance and time limits

**User Story:** As a user, I want loading states not to degrade application performance, so that the experience remains smooth.

#### Acceptance Criteria

1. THE Loading_State SHALL use exclusively CSS animations (not JavaScript) and maintain a rendering rate of at least 60 frames per second during animation in the Content_Area
2. IF the Transition_Period exceeds 10 seconds, THEN THE Loading_State SHALL display a message informing the user that loading is taking longer than expected
3. IF the Transition_Period exceeds 30 seconds, THEN THE Loading_State SHALL display an option allowing the user to cancel loading or retry navigation
4. WHILE Loading_State is visible in the Content_Area, THE Loading_State SHALL remain below the Progress_Bar in the visual hierarchy, without overlapping, hiding, or interrupting the animation of the existing Progress_Bar
