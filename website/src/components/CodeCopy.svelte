<script lang="ts">
  // Code block copy button manager (#7320), a Svelte island since #7320.
  // Converted from the inline script in PageScripts.astro to satisfy the rule
  // that all interactive widgets are Svelte islands (#7313).
  //
  // One island per page manages copy buttons across all code blocks
  // (pre.code-block, pre.astro-code, pre[data-copy]), avoiding the overhead
  // of mounting an island per code block across hundreds of pages.
  //
  // Follows #7320 requirements:
  // - Always visible
  // - Accessible label ("Copy code")
  // - Copied-state announcement via aria-live="polite"
  // - 48px touch target (enforced in docs.css)
  import { onMount } from 'svelte';
  import { attachCopyButtons } from '../lib/code-copy.ts';

  let announcement = $state('');

  onMount(() => {
    let detach = attachCopyButtons(document, (msg) => {
      announcement = msg;
    });

    const onPageLoad = (): void => {
      detach();
      detach = attachCopyButtons(document, (msg) => {
        announcement = msg;
      });
    };

    document.addEventListener('astro:page-load', onPageLoad);

    return () => {
      detach();
      document.removeEventListener('astro:page-load', onPageLoad);
    };
  });
</script>

<div class="visually-hidden" aria-live="polite" aria-atomic="true">
  {announcement}
</div>
