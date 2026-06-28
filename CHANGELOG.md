# [1.44.0](https://github.com/rjdmacedo/knots/compare/v1.43.2...v1.44.0) (2026-06-28)


### Bug Fixes

* improve expense split balancing, validation, and row layout ([fe55a02](https://github.com/rjdmacedo/knots/commit/fe55a0274ee4933b403fd3eb54ae5430a9b13c84))


### Features

* improve expense list and activity loading states ([7f35a1d](https://github.com/rjdmacedo/knots/commit/7f35a1da201dad7736661c40f206de525d5e0a95))
* improve expense title suggestions with controlled input ([f935cb7](https://github.com/rjdmacedo/knots/commit/f935cb7c514adb3d05f1b5e72d02c7fc11573f24))
* overhaul expense creation form and selectors ([65669c8](https://github.com/rjdmacedo/knots/commit/65669c898e02a1f8e0114165b0c008a4ce6da35c))

## [1.43.2](https://github.com/rjdmacedo/knots/compare/v1.43.1...v1.43.2) (2026-06-27)


### Bug Fixes

* improve document upload grid and add button on mobile ([a209ba2](https://github.com/rjdmacedo/knots/commit/a209ba269afda0074a791e8003681213e33b02d6))
* improve mobile expense form layout and collapsible sections ([cfd18e5](https://github.com/rjdmacedo/knots/commit/cfd18e5ce110e2f4441d13710026206ca9ab85ad))
* use full drawer width in expense participant picker ([33be5bc](https://github.com/rjdmacedo/knots/commit/33be5bce8b1a4b477421c137c5869367507ea128))

## [1.43.1](https://github.com/rjdmacedo/knots/compare/v1.43.0...v1.43.1) (2026-06-27)


### Bug Fixes

* prevent group balance text from overlapping timeline rows ([2d69fc0](https://github.com/rjdmacedo/knots/commit/2d69fc03350eee1bb690c7951ed9ec53c683f345))

# [1.43.0](https://github.com/rjdmacedo/knots/compare/v1.42.0...v1.43.0) (2026-06-27)


### Features

* add unified expense detail pages for groups and friends ([39ba9a4](https://github.com/rjdmacedo/knots/commit/39ba9a4be812343334ad10653de5a3e87f1f23b9))
* extend expense and friend APIs for unified detail flow ([ce199a4](https://github.com/rjdmacedo/knots/commit/ce199a4947d68cefceb5552c1480b993e6507d90))
* implement friend timeline UI, direct expenses flow and clean up old views ([2751792](https://github.com/rjdmacedo/knots/commit/2751792c5a9a1456dddbda48fd3b9304250a63b1))
* improve friend profile tabs and timeline UX ([8728719](https://github.com/rjdmacedo/knots/commit/8728719b9013630c7b74646b3abe7b8efe4bd001))
* replace dedicated expense routes with floating create/edit dialog ([22e9aa9](https://github.com/rjdmacedo/knots/commit/22e9aa9af4bf1eb1d35ee9b6f21f536434281a7d))
* resolve dyad group currency from both members' preferences ([dfe8d11](https://github.com/rjdmacedo/knots/commit/dfe8d117394ae21ddb0b4b55af645b25f4218aeb))

# [1.42.0](https://github.com/rjdmacedo/knots/compare/v1.41.0...v1.42.0) (2026-06-25)


### Bug Fixes

* prevent expense title suggestions flicker while typing ([aa6be7b](https://github.com/rjdmacedo/knots/commit/aa6be7b0e4e3ac5baef56d224f76dfcd9b038ce1))


### Features

* add friend tabs component for navigation between friend-related views ([4492307](https://github.com/rjdmacedo/knots/commit/44923077661f185499370085f1a05c5723668b5c))
* suggest frequent expense titles on input focus ([c972da0](https://github.com/rjdmacedo/knots/commit/c972da04a1b65ef715e79fa75cfe1407cb3b434f))

# [1.41.0](https://github.com/rjdmacedo/knots/compare/v1.40.0...v1.41.0) (2026-06-25)


### Bug Fixes

* revert group slug routes and keep user usernames ([588ce60](https://github.com/rjdmacedo/knots/commit/588ce60a8e5243da1126de7c082915cf08596266))
* update Frankfurter exchange rate API URL ([2aafe03](https://github.com/rjdmacedo/knots/commit/2aafe03b88b04177c4981184278e8f199ca3f4e9))


### Features

* default expense currency to user preference ([eae5dd1](https://github.com/rjdmacedo/knots/commit/eae5dd1089f8c493039bd76c2995c2a2d0300e2d))
* include shared group expenses in friend view ([802d1eb](https://github.com/rjdmacedo/knots/commit/802d1eb92fac1322d6ecce37e78897425ed98c42))

# [1.40.0](https://github.com/rjdmacedo/knots/compare/v1.39.0...v1.40.0) (2026-06-24)


### Bug Fixes

* align push notification property tests with actor filtering ([f5f68ec](https://github.com/rjdmacedo/knots/commit/f5f68ecb517ff3552acb674f2c488760dca21915))
* invalidate sessions when user no longer exists ([a099b29](https://github.com/rjdmacedo/knots/commit/a099b29b9b32b06dc1e51632aebda448795a7fcd))


### Features

* add friend detail pages with activity and stats tabs ([5cb43c0](https://github.com/rjdmacedo/knots/commit/5cb43c0c635c579b99d22f6b9a3ac0f09541c3e1))
* add group settlements with payment request emails ([71ee569](https://github.com/rjdmacedo/knots/commit/71ee569702fbe138e862c8db9944d66d5261b241))
* add password visibility toggle on login page ([1c13928](https://github.com/rjdmacedo/knots/commit/1c13928a69f636e4ba1b807a849869431e9bbac1))
* add simplify debts option for group balances ([e4e8f11](https://github.com/rjdmacedo/knots/commit/e4e8f11b013a1e01e2db07bfa97b8deb5293589b))
* move profile settings to header user menu with theme switcher ([330e5e3](https://github.com/rjdmacedo/knots/commit/330e5e3a7992b64b248bf43c49ce77e896db5c60))
* recover from stale sessions and runtime errors ([85a6284](https://github.com/rjdmacedo/knots/commit/85a6284b009c38308c86ae10affb21629a66b2b5))
* redesign global activity feed with card layout ([dd1e812](https://github.com/rjdmacedo/knots/commit/dd1e812ff704f376904ee036e84c8ac8ecc21b0e))
* unify detail page layout and replace group tabs ([5ffd4fc](https://github.com/rjdmacedo/knots/commit/5ffd4fc3bd47fc547c6266f25affaf2cbb9a1a48))

# [1.39.0](https://github.com/rjdmacedo/knots/compare/v1.38.0...v1.39.0) (2026-06-23)


### Bug Fixes

* keep expense date group headers visible under sticky nav ([27cd47f](https://github.com/rjdmacedo/knots/commit/27cd47f5652aaed57d7d21c81b3f82238ca832d8))


### Features

* add dyad groups for direct friend expense tracking ([250fd35](https://github.com/rjdmacedo/knots/commit/250fd356d65d64d1457f8829799d7ca26a32a045))
* add friend expenses page across shared and dyad groups ([b2123b3](https://github.com/rjdmacedo/knots/commit/b2123b38d25a10840affa8fff466700605df934f))

# [1.38.0](https://github.com/rjdmacedo/knots/compare/v1.37.1...v1.38.0) (2026-06-23)


### Features

* add reimbursements section to Stats dashboard ([73eb621](https://github.com/rjdmacedo/knots/commit/73eb6210f570b475544db8fbf14fd584e0827d62))

## [1.37.1](https://github.com/rjdmacedo/knots/compare/v1.37.0...v1.37.1) (2026-06-23)


### Bug Fixes

* align BY_PERCENTAGE balances with Stats and Balances tab ([bf77b4f](https://github.com/rjdmacedo/knots/commit/bf77b4f24b0db5d51c52da2f473ce9362e303ce7))

# [1.37.0](https://github.com/rjdmacedo/knots/compare/v1.36.2...v1.37.0) (2026-06-23)


### Features

* add aggregated friend balances across shared groups ([fe48f3c](https://github.com/rjdmacedo/knots/commit/fe48f3cbc54a7e1fd7031028dec28238932a25f1))

## [1.36.2](https://github.com/rjdmacedo/knots/compare/v1.36.1...v1.36.2) (2026-06-23)


### Bug Fixes

* restore group expense exports after content-disposition v2 API change ([c6d3696](https://github.com/rjdmacedo/knots/commit/c6d3696accfefe354c39654b934524510fe2469e))

## [1.36.1](https://github.com/rjdmacedo/knots/compare/v1.36.0...v1.36.1) (2026-06-20)


### Bug Fixes

* replace StickyNote with FileText icon on expense notes ([dc05a86](https://github.com/rjdmacedo/knots/commit/dc05a860654fcdf94839cc0087eccb2d6a40c34a))

# [1.36.0](https://github.com/rjdmacedo/knots/compare/v1.35.3...v1.36.0) (2026-06-20)


### Features

* add ExpenseNotes component and update translations ([7f6a0d3](https://github.com/rjdmacedo/knots/commit/7f6a0d3030e9b400eaba86b7b4b79e33ff6d2c7f))
* implement ExpenseTitleInput component and enhance expense form interactions ([405b163](https://github.com/rjdmacedo/knots/commit/405b16377a36e825dedbd0f43514c26408658440))

## [1.35.3](https://github.com/rjdmacedo/knots/compare/v1.35.2...v1.35.3) (2026-06-18)


### Bug Fixes

* migrate from Radix to Base UI to fix iOS Safari viewport bug ([74adf97](https://github.com/rjdmacedo/knots/commit/74adf979b400034d364b2621ac2418fc3f45aaa4))
* migrate from Radix to Base UI to fix iOS Safari viewport bug ([3ca65f8](https://github.com/rjdmacedo/knots/commit/3ca65f8301fee8cc5cae7655fbafd4c804f8ff4f))
* migrate from Radix to Base UI to fix iOS Safari viewport bug ([fcd2e50](https://github.com/rjdmacedo/knots/commit/fcd2e50e559bf2782b97846362bee9c39e9dac75))

## [1.35.2](https://github.com/rjdmacedo/knots/compare/v1.35.1...v1.35.2) (2026-06-03)


### Bug Fixes

* show group not-found page when user lacks access ([8366776](https://github.com/rjdmacedo/knots/commit/8366776320505f6f530ec893e57d95338246a5b8))

## [1.35.1](https://github.com/rjdmacedo/knots/compare/v1.35.0...v1.35.1) (2026-06-02)


### Bug Fixes

* **ci:** trigger CD workflow with the correct release tag instead of original commit ([608eb4f](https://github.com/rjdmacedo/knots/commit/608eb4f9c557a5c076de6083b798307ca70395ff))

# [1.35.0](https://github.com/rjdmacedo/knots/compare/v1.34.0...v1.35.0) (2026-06-02)


### Features

* add form ID for expense submission and link SubmitButton to form ([ed1d460](https://github.com/rjdmacedo/knots/commit/ed1d460d0548cbe490891cfcd34c4e16c2de7559))

# [1.34.0](https://github.com/rjdmacedo/knots/compare/v1.33.0...v1.34.0) (2026-06-02)


### Features

* translate missing keys in localizations and implement user preferences, blocked users, friends, and activities ([f02dd78](https://github.com/rjdmacedo/knots/commit/f02dd78a8af9d7fdb6c069235325a3fe2e232a04))

# [1.33.0](https://github.com/rjdmacedo/knots/compare/v1.32.0...v1.33.0) (2026-06-02)


### Features

* map Splitwise CSV names to group members on import ([cdd1512](https://github.com/rjdmacedo/knots/commit/cdd1512f79c699f34361ace36211c8843a7f5e40))

# [1.32.0](https://github.com/rjdmacedo/knots/compare/v1.31.0...v1.32.0) (2026-06-02)


### Features

* add Knots import, group archive/delete, and cancellable imports ([32b5995](https://github.com/rjdmacedo/knots/commit/32b5995501c9e4fb449ed486f5e69873b1d3b2bd))

# [1.31.0](https://github.com/rjdmacedo/knots/compare/v1.30.1...v1.31.0) (2026-06-02)


### Features

* add group member management, profile settings, and participant-to-user migration ([b06d84d](https://github.com/rjdmacedo/knots/commit/b06d84db2c7b85b9dfc383d87e41b7567b9177d3))

## [1.30.1](https://github.com/rjdmacedo/knots/compare/v1.30.0...v1.30.1) (2026-06-01)


### Bug Fixes

* build Docker image from release commit instead of stale version tag ([213d9c7](https://github.com/rjdmacedo/knots/commit/213d9c7c72cca7b70c7bb871f5cb4aa9ee823be5))

# [1.30.0](https://github.com/rjdmacedo/knots/compare/v1.29.0...v1.30.0) (2026-05-31)


### Features

* add new dependencies for visually hidden elements and deep merging ([2831188](https://github.com/rjdmacedo/knots/commit/2831188fa7e01b53aac72fea795ca5ea08cf52d4))

# [1.29.0](https://github.com/rjdmacedo/knots/compare/v1.28.0...v1.29.0) (2026-05-31)


### Features

* implement authentication features with user management and session handling ([a33b2ec](https://github.com/rjdmacedo/knots/commit/a33b2ecbb7d6c8477f6b1e20edf55504399a0e9b))

# [1.28.0](https://github.com/rjdmacedo/knots/compare/v1.27.0...v1.28.0) (2026-05-31)


### Features

* add CHANGELOG.md to Dockerfile for improved documentation ([aac0621](https://github.com/rjdmacedo/knots/commit/aac0621367f210f2d26f58bde43922299767f405))

# [1.27.0](https://github.com/rjdmacedo/knots/compare/v1.26.0...v1.27.0) (2026-05-31)


### Features

* update task list with property test status and add category mapping tests ([e3941da](https://github.com/rjdmacedo/knots/commit/e3941da7fafcdefa5d26f6611ec7208f7e808267))

# [1.26.0](https://github.com/rjdmacedo/knots/compare/v1.25.0...v1.26.0) (2026-05-31)


### Features

* implement title-category mapping for expenses with lookup and upsert functionality ([b80cfef](https://github.com/rjdmacedo/knots/commit/b80cfef421b1e9be41538f92227c6d0248620cc2))

# [1.25.0](https://github.com/rjdmacedo/knots/compare/v1.24.0...v1.25.0) (2026-05-30)


### Features

* mark computation module tests and tasks as complete ([dc12846](https://github.com/rjdmacedo/knots/commit/dc1284693591fa20612bf2cfee866ae3b8070ee9))

# [1.24.0](https://github.com/rjdmacedo/knots/compare/v1.23.0...v1.24.0) (2026-05-30)


### Features

* add components for daily average, participant ranking, net balances, and spending over time with localization support ([0e4579b](https://github.com/rjdmacedo/knots/commit/0e4579b141095268c61560928faa18bfd5a8cca5))
* add spin delay for loading states and implement chart components for balances visualization ([f03c3d6](https://github.com/rjdmacedo/knots/commit/f03c3d6b1fa467a2da7bde068e12ed9ca70897f8))
* implement static changelog page with parser and content rendering ([a47a5b9](https://github.com/rjdmacedo/knots/commit/a47a5b93210f71f86eeca9ca9348ac59a8eb4b29))
* implement visual loading states with skeleton placeholders for improved user feedback during navigation ([172929a](https://github.com/rjdmacedo/knots/commit/172929ad949d365975198f9cbc567598a661e5b8))

# [1.23.0](https://github.com/rjdmacedo/knots/compare/v1.22.1...v1.23.0) (2026-05-30)


### Features

* standardize tooltip usage across icon buttons and add notifications toggle to context menu ([e0bf2a6](https://github.com/rjdmacedo/knots/commit/e0bf2a62366394b3b439c998ac6a1f64de422b29))

## [1.22.1](https://github.com/rjdmacedo/knots/compare/v1.22.0...v1.22.1) (2026-05-30)


### Bug Fixes

* add VAPID keys to build.env for push notifications in production ([62623c9](https://github.com/rjdmacedo/knots/commit/62623c90991fe30705908edd0cd81f636fafad6a))

# [1.22.0](https://github.com/rjdmacedo/knots/compare/v1.21.0...v1.22.0) (2026-05-30)


### Features

* add activity change log and group push notifications ([2a1a1bd](https://github.com/rjdmacedo/knots/commit/2a1a1bddc675394f8f27dbeb0e19e6026c6c135a))
* add change rendering, UI specs, and backend integration for activity diffs ([ee7ac5d](https://github.com/rjdmacedo/knots/commit/ee7ac5d7ea84a616da1627c1390956dec82a7a08))

# [1.21.0](https://github.com/rjdmacedo/knots/compare/v1.20.6...v1.21.0) (2026-03-10)


### Features

* update README.md to include deployment instructions ([8e66eea](https://github.com/rjdmacedo/knots/commit/8e66eea38e19770660cd5d5f2288ac59c4c2270e))

## [1.20.6](https://github.com/rjdmacedo/knots/compare/v1.20.5...v1.20.6) (2025-11-28)


### Bug Fixes

* prepend 'v' to tag when triggering CD workflow ([#24](https://github.com/rjdmacedo/knots/issues/24)) ([18f132d](https://github.com/rjdmacedo/knots/commit/18f132d616994ae39095a6a4168512cbca086250))

## [1.20.5](https://github.com/rjdmacedo/knots/compare/v1.20.4...v1.20.5) (2025-11-28)


### Bug Fixes

* add GH_TOKEN env var to trigger CD workflow step ([#23](https://github.com/rjdmacedo/knots/issues/23)) ([46fb65e](https://github.com/rjdmacedo/knots/commit/46fb65e1ef41a2649e5302023438684d96a24e88))

## [1.20.4](https://github.com/rjdmacedo/knots/compare/v1.20.3...v1.20.4) (2025-11-28)


### Bug Fixes

* use multi-line run to avoid quoting issues in version extraction ([#21](https://github.com/rjdmacedo/knots/issues/21)) ([927f58e](https://github.com/rjdmacedo/knots/commit/927f58e5d6c74cf71b860bf63d09d5ac582a094a))

## [1.20.3](https://github.com/rjdmacedo/knots/compare/v1.20.2...v1.20.3) (2025-11-28)

### Bug Fixes

- auto‑trigger CD workflow after semantic‑release (issue [#19](https://github.com/rjdmacedo/knots/issues/19)) ([#20](https://github.com/rjdmacedo/knots/issues/20)) ([cc03884](https://github.com/rjdmacedo/knots/commit/cc03884a64cc822535ee97cd2e52d50de2269b52))

## [1.20.2](https://github.com/rjdmacedo/knots/compare/v1.20.1...v1.20.2) (2025-11-28)

### Bug Fixes

- make activity list subheaders stretch full width ([#18](https://github.com/rjdmacedo/knots/issues/18)) ([8d7aaf2](https://github.com/rjdmacedo/knots/commit/8d7aaf2cac1e032a0457acd20d808d08624cbc39))

## [1.20.1](https://github.com/rjdmacedo/knots/compare/v1.20.0...v1.20.1) (2025-11-12)

### Bug Fixes

- remove [skip ci] from semantic-release and add manual workflow dispatch ([#16](https://github.com/rjdmacedo/knots/issues/16)) ([eb5e196](https://github.com/rjdmacedo/knots/commit/eb5e196fe79a9829a79189c76f470f020a395676))
- update semantic-release workflow to use npx and add manual dispatch ([#17](https://github.com/rjdmacedo/knots/issues/17)) ([2bbda74](https://github.com/rjdmacedo/knots/commit/2bbda74ec9c3f8753953593b5ca4d5cd879bdb60))

# [1.20.0](https://github.com/rjdmacedo/knots/compare/v1.19.8...v1.20.0) (2025-11-12)

### Bug Fixes

- skip postinstall scripts in release workflow ([afc1f93](https://github.com/rjdmacedo/knots/commit/afc1f931b385c38be4dec285bdf31405d4fe516d))

### Features

- add semantic-release for automatic version management ([#15](https://github.com/rjdmacedo/knots/issues/15)) ([8dd0de6](https://github.com/rjdmacedo/knots/commit/8dd0de657a18e526bb25d279567b5bd2341991ee))
