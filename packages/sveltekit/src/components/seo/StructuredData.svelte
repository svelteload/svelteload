<script lang="ts">
    interface SocialLink {
        url?: string | null
    }

    interface CompanyLogo {
        url?: string | null
    }

    interface CompanyInfo {
        brandName?: string | null
        legalName?: string | null
        alternateNames?: Array<{ name?: string | null }> | null
        description?: string | null
        logo?: CompanyLogo | string | null
        email?: string | null
        phoneNumber?: string | null
        address?: {
            streetAddress?: string | null
            postalCode?: string | null
            city?: string | null
            country?: string | null
        } | null
        socialLinks?: SocialLink[] | null
    }

    interface Props {
        companyInfo?: CompanyInfo | null
        siteUrl: string
        searchPath?: string | null
        inLanguage?: string
    }

    let { companyInfo, siteUrl, searchPath, inLanguage = 'en' }: Props = $props()

    function safeJson(obj: unknown): string {
        return JSON.stringify(obj)
            .replace(/</g, '\\u003c')
            .replace(/>/g, '\\u003e')
            .replace(/&/g, '\\u0026')
    }

    function normalizedSiteUrl(raw: string): string {
        if (!raw) return ''
        const withScheme = raw.startsWith('http') ? raw : `https://${raw}`
        return withScheme.replace(/\/+$/, '')
    }

    function logoUrl(logo: CompanyInfo['logo']): string | null {
        if (!logo) return null
        if (typeof logo === 'string') return logo
        return logo.url ?? null
    }

    const url = $derived(normalizedSiteUrl(siteUrl))

    const organization = $derived.by(() => {
        if (!companyInfo?.brandName || !url) return null

        const alternateNames = (companyInfo.alternateNames ?? [])
            .map(a => a?.name?.trim())
            .filter((n): n is string => !!n)
        const sameAs = (companyInfo.socialLinks ?? [])
            .map(l => l?.url?.trim())
            .filter((n): n is string => !!n)
        const logo = logoUrl(companyInfo.logo)
        const addr = companyInfo.address

        const data: Record<string, unknown> = {
            '@context': 'https://schema.org',
            '@type': 'Organization',
            name: companyInfo.brandName,
            url,
        }
        if (companyInfo.legalName) data.legalName = companyInfo.legalName
        if (alternateNames.length) data.alternateName = alternateNames
        if (companyInfo.description) data.description = companyInfo.description
        if (logo) data.logo = logo
        if (companyInfo.email) data.email = companyInfo.email
        if (companyInfo.phoneNumber) data.telephone = companyInfo.phoneNumber
        if (sameAs.length) data.sameAs = sameAs
        if (addr?.streetAddress || addr?.city) {
            const postal: Record<string, unknown> = { '@type': 'PostalAddress' }
            if (addr.streetAddress) postal.streetAddress = addr.streetAddress
            if (addr.postalCode) postal.postalCode = addr.postalCode
            if (addr.city) postal.addressLocality = addr.city
            if (addr.country) postal.addressCountry = addr.country
            data.address = postal
        }
        return data
    })

    const website = $derived.by(() => {
        if (!url || !companyInfo?.brandName) return null
        const data: Record<string, unknown> = {
            '@context': 'https://schema.org',
            '@type': 'WebSite',
            name: companyInfo.brandName,
            url,
            inLanguage,
        }
        if (searchPath) {
            const cleaned = searchPath.startsWith('/') ? searchPath : `/${searchPath}`
            data.potentialAction = {
                '@type': 'SearchAction',
                target: {
                    '@type': 'EntryPoint',
                    urlTemplate: `${url}${cleaned}?q={search_term_string}`,
                },
                'query-input': 'required name=search_term_string',
            }
        }
        return data
    })
</script>

<svelte:head>
    {#if organization}
        {@html `<script type="application/ld+json">${safeJson(organization)}</script>`}
    {/if}
    {#if website}
        {@html `<script type="application/ld+json">${safeJson(website)}</script>`}
    {/if}
</svelte:head>
