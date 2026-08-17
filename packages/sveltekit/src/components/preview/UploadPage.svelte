<script lang="ts">
	import { PREVIEW_THEME_CSS, PREVIEW_PAGE_CSS } from './theme';

	let {
		data,
		form = null
	}: { data: { signedIn: boolean }; form?: { error?: string } | null } = $props();

	const MAX_DIMENSION = 2560;
	const REENCODABLE = new Set(['image/jpeg', 'image/png', 'image/webp']);

	let busy = $state(false);
	let failure = $state('');
	let uploaded = $state<Array<{ name: string; size: number }>>([]);
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
				uploaded = [...uploaded, { name, size: shrunk.size }];
			}
		} catch (err) {
			failure = err instanceof Error ? err.message : String(err);
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head>
	{@html `<style>${PREVIEW_THEME_CSS}${PREVIEW_PAGE_CSS}</style>`}
	<meta name="robots" content="noindex,nofollow" />
	<title>Upload images</title>
</svelte:head>

<main class="sl-preview">
	<div class="panel">
		{#if data.signedIn}
			<h1>Upload images</h1>

			<input
				id="sl-files"
				class="picker"
				type="file"
				accept="image/*"
				multiple
				onchange={(e) => {
					const input = e.currentTarget as HTMLInputElement;
					if (input.files?.length) upload(input.files);
					input.value = '';
				}}
			/>
			<label
				for="sl-files"
				class="drop"
				class:dragging
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
				<span>{busy ? 'Uploading…' : 'Drop images here, or click to choose'}</span>
			</label>

			{#if uploaded.length}
				<ul class="files">
					{#each uploaded as file}
						<li>
							<span class="name">{file.name}</span>
							<span class="size">{(file.size / 1024 / 1024).toFixed(1)} MB</span>
						</li>
					{/each}
				</ul>
				<p class="done">You can close this tab.</p>
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
	</div>
</main>

<style>
	main {
		box-sizing: border-box;
		min-height: 100dvh;
		display: flex;
		padding: 2.5rem 1.5rem;
		background: var(--sl-bg);
		color: var(--sl-text);
	}

	.panel {
		width: 100%;
		max-width: 32rem;
		margin: auto;
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

	.picker {
		position: absolute;
		width: 0;
		height: 0;
		opacity: 0;
		pointer-events: none;
	}

	.drop {
		box-sizing: border-box;
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 16rem;
		margin: 1.25rem 0 0;
		padding: 1.5rem;
		text-align: center;
		border: 1px dashed var(--sl-border);
		border-radius: 3px;
		color: var(--sl-muted);
		cursor: pointer;
		transition: border-color 0.2s ease, color 0.2s ease;
	}

	.drop:hover,
	.drop.dragging {
		border-color: var(--sl-text);
		color: var(--sl-text);
	}

	.files {
		list-style: none;
		margin: 1.25rem 0 0;
		padding: 0;
	}

	.files li {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.35rem 0;
		border-bottom: 1px solid var(--sl-border);
	}

	.name {
		word-break: break-all;
	}

	.size {
		color: var(--sl-muted);
		white-space: nowrap;
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
		margin: 1rem 0 0;
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
