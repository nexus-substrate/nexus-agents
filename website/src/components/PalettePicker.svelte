<script lang="ts">
  // Palette Deck picker (remarque-tokens/deck), a Svelte island like every
  // interactive widget here (README.md). It wraps the <details> markup that
  // PalettePicker.astro server-renders, passed in as the default slot, so
  // Svelte adopts those nodes and there is one copy. DeckInit.astro restored
  // the stored palette before paint; this wires the radios (bindPicker) and
  // updates the "Theme:" label.
  //
  // Server-rendered hidden and revealed on mount, like ThemeToggle: without
  // JS the radios would do nothing.
  //
  // A palette change dispatches nexus:themechange, the event ThemeToggle
  // dispatches, so Mermaid re-reads the tokens and redraws its diagrams in
  // the new colors.
  import { onMount, type Snippet } from 'svelte';
  import { createDeck, bindPicker } from 'remarque-tokens/deck';
  import { paletteLabel, type DeckPalette } from '../lib/palette-deck.ts';

  interface Props {
    palettes: DeckPalette[];
    children?: Snippet;
  }

  const { palettes, children }: Props = $props();

  let mounted = $state(false);
  // display: contents, so the wrapper adds no box.
  let root: HTMLElement | undefined;

  onMount(() => {
    const picker = root?.querySelector<HTMLElement>('#palette-picker');
    if (picker === null || picker === undefined) return;
    const label = picker.querySelector('[data-deck-current]');
    const deck = createDeck(palettes);
    deck.restore();
    let shown: string | null = deck.current();
    bindPicker(deck, picker, {
      onChange: (name) => {
        if (label !== null) label.textContent = paletteLabel(palettes, name);
        if (name === shown) return;
        shown = name;
        document.dispatchEvent(new CustomEvent('nexus:themechange'));
      },
    });
    mounted = true;
  });
</script>

<div class="palette-picker" hidden={!mounted} bind:this={root}>{@render children?.()}</div>

<style>
  .palette-picker:not([hidden]) {
    display: contents;
  }
</style>
