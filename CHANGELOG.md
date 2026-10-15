# Changelog
All notable changes to this project will be documented in this file.
See the GitHub Releases page for detailed changelogs: https://github.com/amsyeung/translate-me/releases



## [1.2.0](https://github.com/amsyeung/translate-me/compare/v1.1.3...v1.2.0) (2026-10-15)

### Features

* **voice:** free natural voices through a shared Azure proxy ([b667a7c](https://github.com/amsyeung/translate-me/commit/b667a7cd83600699a24271c3eb5bf31818b76c14))
* **voice:** Hong Kong and Macau time zones mean Cantonese for Traditional Chinese ([9180962](https://github.com/amsyeung/translate-me/commit/9180962c9cd1af0a5b860015c52ececb8a9e70ab))
* **voice:** per-person daily limit and hand-picked default voices ([6fc280d](https://github.com/amsyeung/translate-me/commit/6fc280ddd3d18390cf77603ec295fa019263ffb6))

### Bug Fixes

* **options:** clear a stale shared-voice error once the voice list loads ([3123e23](https://github.com/amsyeung/translate-me/commit/3123e230d68e3d691c8d8afb4b23d4be9c05b21c))
* **options:** say plainly that API keys never leave for anywhere but the provider ([438120b](https://github.com/amsyeung/translate-me/commit/438120bd4a760669bfdbb70a4d7a50fe1b37b324))
* **tts-proxy:** never cache or serve empty audio ([f4f0088](https://github.com/amsyeung/translate-me/commit/f4f00883c5210963117f674412b0c3bc7e3ffa40))
* **tts-proxy:** serve the public voice list without requiring Origin ([8527b30](https://github.com/amsyeung/translate-me/commit/8527b30e68609373bfc705a285b1f69b76676767))
* **voice:** count characters the way Azure bills them ([423b67c](https://github.com/amsyeung/translate-me/commit/423b67ce4f5efdb439a5b7118c872a2d41e39a32))

## [1.1.3](https://github.com/amsyeung/translate-me/compare/v1.1.2...v1.1.3) (2026-10-12)

### Bug Fixes

* **popup:** clear Hide/Show buttons and always start collapsed ([e73a172](https://github.com/amsyeung/translate-me/commit/e73a17262c8f790d3d5d540c4179af5f63940810))

## [1.1.2](https://github.com/amsyeung/translate-me/compare/v1.1.1...v1.1.2) (2026-10-12)

### Bug Fixes

* **voice:** support ElevenLabs keys without the voices_read permission ([7bb613c](https://github.com/amsyeung/translate-me/commit/7bb613cd6092b5e8215532c21ee26b37dd479a3d))

## [1.1.1](https://github.com/amsyeung/translate-me/compare/v1.1.0...v1.1.1) (2026-10-12)

### Bug Fixes

* **voice:** API key fields enable Connect immediately and show provider errors ([1c67414](https://github.com/amsyeung/translate-me/commit/1c67414eb3e9a81c77523bc0d60cdb3dd9f25e32))

## [1.1.0](https://github.com/amsyeung/translate-me/compare/v1.0.2...v1.1.0) (2026-10-12)

### Features

* accurate language detection, highlight popover, voice providers ([2506c6c](https://github.com/amsyeung/translate-me/commit/2506c6cea01c75585b53569d459b77ab43f59992))
* **popup:** collapse highlight-to-translate controls into a one-line summary ([367b893](https://github.com/amsyeung/translate-me/commit/367b89334af02081c86dd6b52cef5dd5efdb9aab))

### Bug Fixes

* correct TTS voice selection and speak the right language ([9eb5396](https://github.com/amsyeung/translate-me/commit/9eb539676baaee9c2c338742e3dbb41e77a6929e))
* **ui:** clearer highlight controls and show live keyboard shortcuts ([05ae693](https://github.com/amsyeung/translate-me/commit/05ae6936d2ff696e039f32f7ca903c1f4c6b8b59))

## [1.0.1] - 2025-12-22

### Fixed
- **`shortcut for enable extension`** now removed, use default <ins>chrome://extensions/shortcuts</ins> instead
- **`types for @ts-ignore`** now relocate all types to src/types/* directory
