import qs from 'qs'

export interface FindResult {
  docs: Record<string, unknown>[]
  totalDocs: number
  totalPages: number
  page: number
  limit: number
  hasNextPage: boolean
  hasPrevPage: boolean
}

export class PayloadClient {
  private readonly baseUrl: string
  private readonly apiKey: string

  constructor(baseUrl: string, apiKey: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, '')
    this.apiKey = apiKey
  }

  private get authHeaders(): Record<string, string> {
    return {
      'Authorization': `users API-Key ${this.apiKey}`,
    }
  }

  private get headers(): Record<string, string> {
    return {
      ...this.authHeaders,
      'Content-Type': 'application/json',
    }
  }

  private buildUrl(path: string, params: Record<string, unknown> = {}): string {
    const query = qs.stringify(params, { addQueryPrefix: true, encode: false })
    return `${this.baseUrl}${path}${query}`
  }

  private async parseResponse<T>(res: Response): Promise<T> {
    const body = await res.json() as Record<string, unknown>

    if (!res.ok) {
      const errors = body.errors as Array<{ message: string }> | undefined
      const message = errors?.[0]?.message || body.message || `HTTP ${res.status}`
      throw new Error(`Payload API error: ${message}`)
    }

    return body as T
  }

  private async request<T>(url: string, options: RequestInit = {}): Promise<T> {
    const res = await fetch(url, {
      ...options,
      headers: { ...this.headers, ...options.headers as Record<string, string> },
    })

    return this.parseResponse<T>(res)
  }

  async find(
    collection: string,
    params: {
      where?: Record<string, unknown>
      locale?: string
      depth?: number
      limit?: number
      page?: number
      sort?: string
    } = {},
  ): Promise<FindResult> {
    const { where, depth, ...rest } = params
    const queryParams: Record<string, unknown> = { draft: true, depth: depth ?? 0, ...rest }
    if (where) queryParams.where = where

    const url = this.buildUrl(`/api/${collection}`, queryParams)
    return this.request<FindResult>(url)
  }

  async findByID(
    collection: string,
    id: string | number,
    params: { locale?: string; depth?: number } = {},
  ): Promise<Record<string, unknown>> {
    const { depth, ...rest } = params
    const queryParams: Record<string, unknown> = { draft: true, depth: depth ?? 0, ...rest }
    const url = this.buildUrl(`/api/${collection}/${id}`, queryParams)
    return this.request<Record<string, unknown>>(url)
  }

  async create(
    collection: string,
    data: Record<string, unknown>,
    params: { locale?: string } = {},
  ): Promise<Record<string, unknown>> {
    const queryParams: Record<string, unknown> = { draft: true, ...params }
    const url = this.buildUrl(`/api/${collection}`, queryParams)
    const safeData = { ...data, _status: 'draft' }
    return this.request<Record<string, unknown>>(url, {
      method: 'POST',
      body: JSON.stringify(safeData),
    })
  }

  async upload(
    collection: string,
    file: { data: Uint8Array<ArrayBuffer>; filename: string; mimeType: string },
    data: Record<string, unknown> = {},
    params: { locale?: string } = {},
  ): Promise<Record<string, unknown>> {
    const form = new FormData()
    form.append('_payload', JSON.stringify(data))
    form.append('file', new Blob([file.data], { type: file.mimeType }), file.filename)

    const url = this.buildUrl(`/api/${collection}`, { depth: 0, ...params })
    const res = await fetch(url, {
      method: 'POST',
      headers: this.authHeaders,
      body: form,
    })

    return this.parseResponse<Record<string, unknown>>(res)
  }

  async update(
    collection: string,
    id: string | number,
    data: Record<string, unknown>,
    params: { locale?: string } = {},
  ): Promise<Record<string, unknown>> {
    const queryParams: Record<string, unknown> = { draft: true, depth: 0, ...params }
    const url = this.buildUrl(`/api/${collection}/${id}`, queryParams)
    const safeData = { ...data, _status: 'draft' }
    return this.request<Record<string, unknown>>(url, {
      method: 'PATCH',
      body: JSON.stringify(safeData),
    })
  }

  async getGlobal(
    slug: string,
    params: { locale?: string; depth?: number } = {},
  ): Promise<Record<string, unknown>> {
    const { depth, ...rest } = params
    const queryParams: Record<string, unknown> = { draft: true, depth: depth ?? 0, ...rest }
    const url = this.buildUrl(`/api/globals/${slug}`, queryParams)
    return this.request<Record<string, unknown>>(url)
  }

  async updateGlobal(
    slug: string,
    data: Record<string, unknown>,
    params: { locale?: string } = {},
  ): Promise<Record<string, unknown>> {
    const queryParams: Record<string, unknown> = { draft: true, depth: 0, ...params }
    const url = this.buildUrl(`/api/globals/${slug}`, queryParams)
    const safeData = { ...data, _status: 'draft' }
    return this.request<Record<string, unknown>>(url, {
      method: 'POST',
      body: JSON.stringify(safeData),
    })
  }
}
