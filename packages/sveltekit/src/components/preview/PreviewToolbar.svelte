<script lang="ts">
	import { page } from '$app/state';
	import { invalidateAll, replaceState } from '$app/navigation';
	import { PREVIEW_THEME_CSS } from './theme';

	type Target = {
		collection: string;
		id: string | number;
		status: string;
		title?: string;
		paths?: Record<string, string>;
	};

	let {
		editUrl = null,
		canPublish = false
	}: { editUrl?: string | null; canPublish?: boolean } = $props();

	const target = $derived((page.data.publishTarget as Target | null | undefined) ?? null);
	const locale = $derived(page.params.lang ?? 'en');
	const isDraft = $derived(target?.status !== 'published');
	const localePaths = $derived(Object.entries(target?.paths ?? {}));

	const MAX_DIMENSION = 2560;
	const REENCODABLE = new Set(['image/jpeg', 'image/png', 'image/webp']);

	let panel = $state<'none' | 'upload' | 'delete'>('none');
	let busy = $state(false);
	let failure = $state('');
	let published = $state(false);

	let alt = $state('');
	let uploaded = $state<Array<{ id: number; filename: string; width?: number; height?: number }>>([]);
	let dragging = $state(false);

	let confirmation = $state('');
	let redirectTo = $state('/');
	let deleted = $state(false);

	const confirmMatches = $derived(Boolean(target?.title) && confirmation.trim() === target?.title);

	let openedOn = $state('');

	$effect(() => {
		const path = page.url.pathname;
		const params = page.url.searchParams;

		if (params.has('delete')) {
			panel = 'delete';
			openedOn = path;
		} else if (params.has('upload')) {
			panel = 'upload';
			openedOn = path;
		} else if (openedOn && openedOn !== path) {
			panel = 'none';
			openedOn = '';
			failure = '';
		}
	});

	function close() {
		panel = 'none';
		openedOn = '';
		failure = '';
		const url = new URL(page.url);
		if (url.searchParams.has('delete') || url.searchParams.has('upload')) {
			url.searchParams.delete('delete');
			url.searchParams.delete('upload');
			replaceState(url, page.state);
		}
	}

	async function publish() {
		if (!target || busy) return;
		busy = true;
		failure = '';
		try {
			const response = await fetch('/api/preview/publish', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ collection: target.collection, id: target.id, locale })
			});
			const result = await response.json();
			if (!response.ok) {
				failure = result?.error ?? 'Publishing failed.';
				return;
			}
			published = true;
			await invalidateAll();
		} catch (err) {
			failure = err instanceof Error ? err.message : String(err);
		} finally {
			busy = false;
		}
	}

	async function shrink(file: File): Promise<Blob> {
		if (!REENCODABLE.has(file.type)) return file;

		const bitmap = await createImageBitmap(file);
		const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
		if (scale === 1 && file.size < 3_000_000) return file;

		const canvas = document.createElement('canvas');
		canvas.width = Math.round(bitmap.width * scale);
		canvas.height = Math.round(bitmap.height * scale);
		const context = canvas.getContext('2d');
		if (!context) return file;
		context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

		return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob ?? file), 'image/webp', 0.9));
	}

	async function upload(files: FileList | File[]) {
		if (busy) return;
		busy = true;
		failure = '';
		try {
			for (const file of Array.from(files)) {
				const shrunk = await shrink(file);
				const name = shrunk === file ? file.name : file.name.replace(/\.[^.]+$/, '') + '.webp';

				const body = new FormData();
				body.set('alt', alt);
				body.set('file', new File([shrunk], name, { type: shrunk.type || file.type }));

				const response = await fetch('/api/preview/upload', { method: 'POST', body });
				const result = await response.json();
				if (!response.ok) {
					failure = result?.error ?? 'The upload failed.';
					return;
				}
				uploaded = [...uploaded, result];
			}
		} catch (err) {
			failure = err instanceof Error ? err.message : String(err);
		} finally {
			busy = false;
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

{#if target}
	<div class="sl-preview bar" class:live={!isDraft}>
		<span class="state">
			{#if published}
				Published. The live site is updated.
			{:else if isDraft}
				Unpublished draft.
			{:else}
				This matches what is live.
			{/if}
		</span>

		<span class="actions">
			{#if canPublish}
				<button type="button" onclick={() => (panel = panel === 'upload' ? 'none' : 'upload')}>
					Upload image
				</button>
			{/if}
			{#if editUrl}
				<a href={editUrl} rel="noreferrer">Edit</a>
			{/if}
			{#if isDraft && !published && canPublish}
				<button class="primary" type="button" onclick={publish} disabled={busy}>
					{busy ? 'Publishing…' : 'Publish'}
				</button>
			{/if}
		</span>
	</div>

	{#if panel !== 'none' && canPublish}
		<div class="sl-preview sheet">
			<div class="card">
				{#if panel === 'upload'}
					{#if uploaded.length}
						<h2>Uploaded</h2>
						<p>Tell your assistant these ids so it can place them.</p>
						<ul>
							{#each uploaded as item}
								<li>{item.id} · {item.filename} · {item.width}×{item.height}</li>
							{/each}
						</ul>
					{:else}
						<h2>Upload an image</h2>
						<p>Large photos are shrunk in your browser first, so this works on mobile data.</p>
					{/if}

					<label for="sl-alt">Describe the image</label>
					<input id="sl-alt" bind:value={alt} placeholder="What is in the picture?" />

					<div
						class="drop"
						class:dragging
						role="button"
						tabindex="0"
						ondragover={(e) => {
							e.preventDefault();
							dragging = true;
						}}
						ondragleave={() => (dragging = false)}
						ondrop={(e) => {
							e.preventDefault();
							dragging = false;
							if (e.dataTransfer?.files?.length) upload(e.dataTransfer.files);
						}}
					>
						{#if busy}
							<span>Uploading…</span>
						{:else}
							<span>Drop an image here, or</span>
							<input
								type="file"
								accept="image/*"
								multiple
								onchange={(e) => {
									const input = e.currentTarget as HTMLInputElement;
									if (input.files?.length) upload(input.files);
								}}
							/>
						{/if}
					</div>
				{:else if deleted}
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
{/if}

<style>
	.bar {
		position: sticky;
		top: 0;
		z-index: 90;
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 0.5rem 1rem;
		background: var(--sl-bg);
		color: var(--sl-text);
		border-bottom: 1px solid var(--sl-border);
	}

	.state {
		flex: 1;
		color: var(--sl-muted);
	}

	.bar.live .state::before {
		content: '';
	}

	.actions {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

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
	button,
	a {
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

	input[type='file'] {
		width: auto;
		border: 0;
		background: none;
	}

	.drop {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.75rem;
		min-height: 10rem;
		margin-top: 1.5rem;
		border: 1px dashed var(--sl-border);
		border-radius: 3px;
		color: var(--sl-muted);
	}

	.drop.dragging {
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

	button,
	a {
		padding: 0.4rem 0.85rem;
		border: 1px solid var(--sl-border);
		border-radius: 3px;
		background: none;
		color: var(--sl-text);
		text-decoration: none;
		cursor: pointer;
	}

	button.primary {
		background: var(--sl-button-bg);
		color: var(--sl-button-text);
		border-color: var(--sl-button-bg);
	}

	button.danger,
	.card form button {
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
