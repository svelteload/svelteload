<script lang="ts">
	import { PREVIEW_THEME_CSS } from './theme';

	let {
		data,
		form = null
	}: { data: { signedIn: boolean }; form?: { error?: string } | null } = $props();

	const MAX_DIMENSION = 2560;
	const REENCODABLE = new Set(['image/jpeg', 'image/png', 'image/webp']);

	let busy = $state(false);
	let failure = $state('');
	let uploaded = $state(0);
	let dragging = $state(false);

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
				body.set('file', new File([shrunk], name, { type: shrunk.type || file.type }));

				const response = await fetch('/api/preview/upload', { method: 'POST', body });
				const result = await response.json();
				if (!response.ok) {
					failure = result?.error ?? 'The upload failed.';
					return;
				}
				uploaded += 1;
			}
		} catch (err) {
			failure = err instanceof Error ? err.message : String(err);
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head>
	{@html `<style>${PREVIEW_THEME_CSS}</style>`}
	<meta name="robots" content="noindex,nofollow" />
	<title>Upload images</title>
</svelte:head>

<main class="sl-preview">
	{#if data.signedIn}
		<h1>Upload images</h1>
		<p>
			They go straight into the site's image library. Your assistant finds them on its own and
			writes the descriptions, so there is nothing to send back.
		</p>

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
				<span>Drop images here, or</span>
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

		<p class="hint">Large photos are shrunk in your browser first, so this works on mobile data.</p>

		{#if uploaded}
			<div class="done">
				{uploaded === 1 ? '1 image is' : `${uploaded} images are`} in the library. You can close this
				tab and carry on in the chat.
			</div>
		{/if}
	{:else}
		<h1>Sign in to upload</h1>
		<p>Use the same details you sign in to the site with.</p>

		<form method="post">
			{#if form?.error}<div class="error">{form.error}</div>{/if}
			<label for="sl-email">Email</label>
			<input id="sl-email" name="email" type="email" autocomplete="username" required />
			<label for="sl-password">Password</label>
			<input
				id="sl-password"
				name="password"
				type="password"
				autocomplete="current-password"
				required
			/>
			<button type="submit">Sign in</button>
		</form>
	{/if}

	{#if failure}<div class="error">{failure}</div>{/if}
</main>

<style>
	main {
		box-sizing: border-box;
		min-height: 100dvh;
		display: grid;
		align-content: start;
		max-width: 32rem;
		margin: 0 auto;
		padding: 3.5rem 1.5rem;
		background: var(--sl-bg);
		color: var(--sl-text);
	}

	h1 {
		font-size: 15px;
		font-weight: 600;
		margin: 0 0 0.75rem;
	}

	p {
		margin: 0 0 1.75rem;
		color: var(--sl-muted);
	}

	.hint {
		font-size: 12px;
		margin: 0.75rem 0 0;
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
		margin: 0 0 1.5rem;
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
		margin: 0;
		border: 0;
		background: none;
	}

	.drop {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.75rem;
		min-height: 12rem;
		border: 1px dashed var(--sl-border);
		border-radius: 3px;
		color: var(--sl-muted);
	}

	.drop.dragging {
		border-color: var(--sl-muted);
	}

	button {
		width: 100%;
		padding: 0.7rem;
		background: var(--sl-button-bg);
		color: var(--sl-button-text);
		border: 0;
		border-radius: 3px;
		cursor: pointer;
	}

	button:hover {
		opacity: 0.85;
	}

	.done {
		margin-top: 1.5rem;
		padding: 0.7rem 0.75rem;
		border: 1px solid var(--sl-border);
		border-radius: 3px;
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
