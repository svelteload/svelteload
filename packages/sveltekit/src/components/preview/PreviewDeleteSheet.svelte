<script lang="ts">
	import { page } from '$app/state';
	import { replaceState } from '$app/navigation';
	import { PREVIEW_THEME_CSS } from './theme';
	import type { PublishTarget } from '../../preview/publishDocument';

	let { canPublish = false }: { canPublish?: boolean } = $props();

	const target = $derived((page.data.publishTarget as PublishTarget | null | undefined) ?? null);
	const localePaths = $derived(Object.entries(target?.paths ?? {}));

	let open = $state(false);
	let busy = $state(false);
	let failure = $state('');

	let confirmation = $state('');
	let redirectTo = $state('/');
	let deleted = $state(false);

	const confirmMatches = $derived(Boolean(target?.title) && confirmation.trim() === target?.title);

	let openedOn = $state('');

	$effect(() => {
		const path = page.url.pathname;
		const params = page.url.searchParams;

		if (params.has('delete')) {
			open = true;
			openedOn = path;
		} else if (openedOn && openedOn !== path) {
			open = false;
			openedOn = '';
			failure = '';
		}
	});

	function close() {
		open = false;
		openedOn = '';
		failure = '';
		const url = new URL(page.url);
		if (url.searchParams.has('delete')) {
			url.searchParams.delete('delete');
			replaceState(url, page.state);
		}
	}

	async function remove(event: SubmitEvent) {
		event.preventDefault();
		if (!target || !confirmMatches || busy) return;
		busy = true;
		failure = '';
		try {
			const response = await fetch('/api/preview/delete', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					collection: target.collection,
					id: target.id,
					confirmation,
					redirectTo
				})
			});
			const result = await response.json();
			if (!response.ok) {
				failure = result?.error ?? 'The deletion failed.';
				return;
			}
			deleted = true;
		} catch (err) {
			failure = err instanceof Error ? err.message : String(err);
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head>
	{@html `<style>${PREVIEW_THEME_CSS}</style>`}
</svelte:head>

{#if target && open && canPublish}
	<div class="sl-preview sheet">
		<div class="card">
			{#if deleted}
				<h2>Deleted</h2>
				<p>
					{target.title} is unpublished and in the trash. Its old addresses redirect to {redirectTo}.
					It can be restored from the CMS.
				</p>
			{:else}
				<h2>Delete this {target.collection === 'blog' ? 'post' : 'page'}?</h2>
				<p>
					This unpublishes <strong>{target.title}</strong> and moves it to trash. Nothing is erased,
					so it can be restored later.
				</p>

				{#if localePaths.length}
					<ul class="paths">
						{#each localePaths as [code, path]}
							<li><span>{code}</span>{path}</li>
						{/each}
					</ul>
				{/if}

				<form onsubmit={remove}>
					<label for="sl-redirect">Send those addresses to</label>
					<input id="sl-redirect" bind:value={redirectTo} placeholder="/" />
					<p class="hint">Search engines keep old links for a long time, so pick somewhere useful.</p>

					<label for="sl-confirm">Type <strong>{target.title}</strong> to confirm</label>
					<input id="sl-confirm" bind:value={confirmation} autocomplete="off" />

					<button class="danger" type="submit" disabled={!confirmMatches || busy}>
						{busy ? 'Deleting…' : 'Delete and redirect'}
					</button>
				</form>
			{/if}

			{#if failure}<div class="error">{failure}</div>{/if}

			<button class="close" type="button" onclick={close}>Close</button>
		</div>
	</div>
{/if}

<style>
	.sheet {
		position: fixed;
		inset: 0;
		z-index: 100;
		overflow-y: auto;
		display: grid;
		place-items: start center;
		padding: 3.5rem 1.5rem;
		background: color-mix(in srgb, var(--sl-base-1000) 55%, transparent);
	}

	.card {
		width: 100%;
		max-width: 30rem;
		padding: 1.75rem;
		background: var(--sl-bg);
		color: var(--sl-text);
		border: 1px solid var(--sl-border);
		border-radius: 3px;
	}

	h2 {
		font-size: 15px;
		margin: 0 0 0.75rem;
	}

	p {
		margin: 0 0 1.75rem;
		color: var(--sl-muted);
	}

	.hint {
		font-size: 12px;
		margin: 0.4rem 0 1.75rem;
	}

	label {
		display: block;
		margin: 0 0 0.5rem;
	}

	input,
	button {
		box-sizing: border-box;
		font: inherit;
	}

	input {
		width: 100%;
		padding: 0.65rem 0.75rem;
		background: var(--sl-input-bg);
		color: var(--sl-text);
		border: 1px solid var(--sl-border);
		border-radius: 3px;
	}

	input:focus-visible {
		outline: none;
		border-color: var(--sl-muted);
	}

	ul {
		margin: 0 0 1.5rem;
		padding-left: 1.1rem;
		color: var(--sl-muted);
		line-height: 1.8;
	}

	ul.paths {
		list-style: none;
		padding: 0.75rem 0.9rem;
		border: 1px solid var(--sl-border);
		border-radius: 3px;
	}

	ul.paths li {
		display: flex;
		gap: 0.75rem;
	}

	ul.paths span {
		text-transform: uppercase;
		min-width: 2rem;
	}

	button {
		padding: 0.4rem 0.85rem;
		border: 1px solid var(--sl-border);
		border-radius: 3px;
		background: none;
		color: var(--sl-text);
		cursor: pointer;
	}

	button.danger {
		width: 100%;
		margin-top: 1rem;
		padding: 0.7rem;
		background: var(--sl-danger);
		color: rgb(255, 255, 255);
		border-color: var(--sl-danger);
	}

	button.close {
		width: 100%;
		margin-top: 1.25rem;
		padding: 0.7rem;
	}

	button:hover:not(:disabled) {
		opacity: 0.85;
	}

	button:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.error {
		background: var(--sl-error-bg);
		border: 1px solid var(--sl-error-border);
		color: var(--sl-error-text);
		padding: 0.6rem 0.75rem;
		border-radius: 3px;
		margin: 1rem 0 0;
	}
</style>
