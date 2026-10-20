<template>
  <div class="api-page">
    <header class="page-header">
      <div>
        <h1>{{ t('apiManagement') }}</h1>
      </div>
      <el-button v-if="activeTab === 'keys'" type="primary" @click="openCreate">
        <Icon icon="lucide:plus" width="17" height="17" />
        <span>{{ t('createApiKey') }}</span>
      </el-button>
    </header>

    <el-tabs v-model="activeTab" class="api-tabs">
      <el-tab-pane :label="t('apiKeys')" name="keys">
        <div class="table-toolbar">
          <span>{{ keys.length }} {{ t('apiKeys') }}</span>
          <el-tooltip :content="t('refresh')">
            <el-button circle text :aria-label="t('refresh')" :loading="loading" @click="loadKeys">
              <Icon icon="lucide:refresh-cw" width="17" height="17" />
            </el-button>
          </el-tooltip>
        </div>

        <el-table v-loading="loading" :data="keys" class="key-table" :empty-text="t('apiNoKeys')">
          <el-table-column :label="t('apiKeyName')" min-width="170">
            <template #default="{ row }">
              <div class="key-name">
                <span>{{ row.name }}</span>
                <code>{{ row.prefix }}...</code>
              </div>
            </template>
          </el-table-column>
          <el-table-column :label="t('apiScopes')" min-width="300">
            <template #default="{ row }">
              <div class="scope-list">
                <el-tag v-for="scope in row.scopes" :key="scope" size="small" effect="plain">
                  {{ scopeLabel(scope) }}
                </el-tag>
              </div>
            </template>
          </el-table-column>
          <el-table-column :label="t('tabStatus')" width="94">
            <template #default="{ row }">
              <el-tag :type="row.status === 0 ? 'success' : 'info'" disable-transitions>
                {{ row.status === 0 ? t('enabled') : t('disabled') }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column :label="t('apiExpiresAt')" min-width="150">
            <template #default="{ row }">{{ formatDate(row.expiresAt, t('apiNeverExpires')) }}</template>
          </el-table-column>
          <el-table-column :label="t('apiLastUsed')" min-width="150">
            <template #default="{ row }">{{ formatDate(row.lastUsedAt, t('apiNeverUsed')) }}</template>
          </el-table-column>
          <el-table-column :label="t('action')" width="142" fixed="right">
            <template #default="{ row }">
              <div class="row-actions">
                <el-tooltip :content="t('edit')">
                  <el-button circle text :aria-label="t('edit')" @click="openEdit(row)">
                    <Icon icon="lucide:pencil" width="16" height="16" />
                  </el-button>
                </el-tooltip>
                <el-tooltip :content="row.status === 0 ? t('disable') : t('enable')">
                  <el-button circle text :aria-label="row.status === 0 ? t('disable') : t('enable')" @click="toggleStatus(row)">
                    <Icon :icon="row.status === 0 ? 'lucide:pause' : 'lucide:play'" width="16" height="16" />
                  </el-button>
                </el-tooltip>
                <el-tooltip :content="t('delete')">
                  <el-button circle text type="danger" :aria-label="t('delete')" @click="removeKey(row)">
                    <Icon icon="lucide:trash-2" width="16" height="16" />
                  </el-button>
                </el-tooltip>
              </div>
            </template>
          </el-table-column>
        </el-table>

        <div v-loading="loading" class="mobile-key-list">
          <div v-for="row in keys" :key="row.apiKeyId" class="mobile-key-item">
            <div class="mobile-key-heading">
              <div class="key-name">
                <span>{{ row.name }}</span>
                <code>{{ row.prefix }}...</code>
              </div>
              <el-tag :type="row.status === 0 ? 'success' : 'info'" disable-transitions>
                {{ row.status === 0 ? t('enabled') : t('disabled') }}
              </el-tag>
            </div>
            <div class="scope-list">
              <el-tag v-for="scope in row.scopes" :key="scope" size="small" effect="plain">
                {{ scopeLabel(scope) }}
              </el-tag>
            </div>
            <div class="mobile-key-meta">
              <span>{{ t('apiExpiresAt') }}: {{ formatDate(row.expiresAt, t('apiNeverExpires')) }}</span>
              <span>{{ t('apiLastUsed') }}: {{ formatDate(row.lastUsedAt, t('apiNeverUsed')) }}</span>
            </div>
            <div class="row-actions">
              <el-tooltip :content="t('edit')">
                <el-button circle text :aria-label="t('edit')" @click="openEdit(row)">
                  <Icon icon="lucide:pencil" width="16" height="16" />
                </el-button>
              </el-tooltip>
              <el-tooltip :content="row.status === 0 ? t('disable') : t('enable')">
                <el-button circle text :aria-label="row.status === 0 ? t('disable') : t('enable')" @click="toggleStatus(row)">
                  <Icon :icon="row.status === 0 ? 'lucide:pause' : 'lucide:play'" width="16" height="16" />
                </el-button>
              </el-tooltip>
              <el-tooltip :content="t('delete')">
                <el-button circle text type="danger" :aria-label="t('delete')" @click="removeKey(row)">
                  <Icon icon="lucide:trash-2" width="16" height="16" />
                </el-button>
              </el-tooltip>
            </div>
          </div>
          <el-empty v-if="!loading && keys.length === 0" :description="t('apiNoKeys')" />
        </div>
      </el-tab-pane>

      <el-tab-pane :label="t('apiReference')" name="docs">
        <div v-loading="docsLoading" class="docs-pane">
          <section class="connection-band">
            <div class="connection-row">
              <div>
                <span class="band-label">{{ t('apiBaseUrl') }}</span>
                <code>{{ baseUrl }}</code>
              </div>
              <el-tooltip :content="t('copy')">
                <el-button circle text :aria-label="t('copy')" @click="copyText(baseUrl)">
                  <Icon icon="lucide:copy" width="17" height="17" />
                </el-button>
              </el-tooltip>
            </div>
            <div class="connection-row">
              <div>
                <span class="band-label">{{ t('apiMachineDocument') }}</span>
                <code>{{ openApiUrl }}</code>
              </div>
              <el-tooltip :content="t('copy')">
                <el-button circle text :aria-label="t('copy')" @click="copyText(openApiUrl)">
                  <Icon icon="lucide:copy" width="17" height="17" />
                </el-button>
              </el-tooltip>
            </div>
          </section>

          <section class="auth-note">
            <Icon icon="lucide:key-round" width="20" height="20" />
            <div>
              <strong>{{ t('apiAuthentication') }}</strong>
              <p>{{ t('apiAuthenticationDesc') }}</p>
            </div>
          </section>

          <section v-if="agentGuidance" class="agent-guide">
            <div class="agent-guide-heading">
              <Icon icon="lucide:bot" width="20" height="20" />
              <div>
                <h2>{{ t('apiAgentWorkflow') }}</h2>
                <p>{{ t('apiAgentWorkflowDesc') }}</p>
              </div>
              <el-tooltip :content="t('apiCopyAgentGuide')">
                <el-button circle text :aria-label="t('apiCopyAgentGuide')" @click="copyText(agentGuideText())">
                  <Icon icon="lucide:copy" width="17" height="17" />
                </el-button>
              </el-tooltip>
            </div>
            <ol class="workflow-list">
              <li v-for="item in agentGuidance.temporaryMailboxWorkflow" :key="item.step">
                <span class="workflow-step">{{ item.step }}</span>
                <code>{{ item.method }} {{ item.path }}</code>
                <span>{{ item.purpose }}</span>
              </li>
            </ol>
            <dl class="guidance-notes">
              <div v-if="agentGuidance.prerequisites?.length">
                <dt>{{ t('apiPrerequisites') }}</dt>
                <dd><ul><li v-for="item in agentGuidance.prerequisites" :key="item">{{ item }}</li></ul></dd>
              </div>
              <div>
                <dt>{{ t('apiPolling') }}</dt>
                <dd>{{ agentGuidance.polling }}</dd>
              </div>
              <div>
                <dt>{{ t('apiIdempotency') }}</dt>
                <dd>{{ agentGuidance.idempotency }}</dd>
              </div>
              <div v-if="agentGuidance.retryPolicy">
                <dt>{{ t('apiRetryPolicy') }}</dt>
                <dd><ul><li v-for="item in agentGuidance.retryPolicy" :key="item">{{ item }}</li></ul></dd>
              </div>
              <div v-if="agentGuidance.limitations?.length">
                <dt>{{ t('apiLimitations') }}</dt>
                <dd><ul><li v-for="item in agentGuidance.limitations" :key="item">{{ item }}</li></ul></dd>
              </div>
            </dl>
          </section>

          <section v-for="group in endpointGroups" :key="group.name" class="endpoint-group">
            <div class="group-heading">
              <h2>{{ group.name }}</h2>
              <p>{{ group.description }}</p>
            </div>
            <el-collapse>
              <el-collapse-item v-for="endpoint in group.endpoints" :key="`${endpoint.method}-${endpoint.path}`">
                <template #title>
                  <div class="endpoint-title">
                    <el-tag :type="methodType(endpoint.method)" effect="dark" class="method-tag">
                      {{ endpoint.method.toUpperCase() }}
                    </el-tag>
                    <code>{{ endpoint.path }}</code>
                    <span class="endpoint-summary">{{ endpoint.summary }}</span>
                    <el-tag v-if="endpoint.scope" size="small" effect="plain" class="endpoint-scope">{{ endpoint.scope }}</el-tag>
                  </div>
                </template>
                <div class="endpoint-body">
                  <p v-if="endpoint.description">{{ endpoint.description }}</p>

                  <div v-if="endpoint.parameters.length" class="doc-section">
                    <h3>{{ t('apiParameters') }}</h3>
                    <div class="field-table">
                      <div v-for="parameter in endpoint.parameters" :key="`${parameter.in}-${parameter.name}`" class="field-row">
                        <code>{{ parameter.name }}</code>
                        <span class="field-meta">{{ parameter.in }} · {{ schemaType(parameter.schema) }}</span>
                        <el-tag v-if="parameter.required" size="small" type="danger" effect="plain">{{ t('apiRequired') }}</el-tag>
                        <span v-else class="field-optional">{{ t('apiOptional') }}</span>
                        <span class="field-description">
                          {{ parameter.description }}
                          <small v-if="schemaRules(parameter.schema)">{{ schemaRules(parameter.schema) }}</small>
                        </span>
                      </div>
                    </div>
                  </div>

                  <div v-if="endpoint.requestFields.length" class="doc-section">
                    <h3>{{ t('apiRequestFields') }}</h3>
                    <div class="field-table">
                      <div v-for="field in endpoint.requestFields" :key="field.name" class="field-row">
                        <code>{{ field.name }}</code>
                        <span class="field-meta">body · {{ field.type }}</span>
                        <el-tag v-if="field.required" size="small" type="danger" effect="plain">{{ t('apiRequired') }}</el-tag>
                        <span v-else class="field-optional">{{ t('apiOptional') }}</span>
                        <span class="field-description">
                          {{ field.description }}
                          <small v-if="field.rules">{{ field.rules }}</small>
                        </span>
                      </div>
                    </div>
                  </div>

                  <div class="doc-section">
                    <h3>{{ t('apiResponses') }}</h3>
                    <div class="response-list">
                      <span v-for="response in endpoint.responses" :key="response.code">
                        <el-tag :type="responseType(response.code)" size="small" effect="plain">{{ response.code }}</el-tag>
                        {{ response.description }}
                      </span>
                    </div>
                  </div>

                  <div class="code-heading">
                    <span>{{ t('apiRequestExample') }}</span>
                    <el-tooltip :content="t('copy')">
                      <el-button circle text :aria-label="t('copy')" @click="copyText(curlExample(endpoint))">
                        <Icon icon="lucide:copy" width="16" height="16" />
                      </el-button>
                    </el-tooltip>
                  </div>
                  <pre><code>{{ curlExample(endpoint) }}</code></pre>

                  <template v-if="endpoint.responseExample !== undefined">
                    <div class="code-heading">
                      <span>{{ t('apiResponseExample') }}</span>
                      <el-tooltip :content="t('copy')">
                        <el-button circle text :aria-label="t('copy')" @click="copyText(formatJson(endpoint.responseExample))">
                          <Icon icon="lucide:copy" width="16" height="16" />
                        </el-button>
                      </el-tooltip>
                    </div>
                    <pre><code>{{ formatJson(endpoint.responseExample) }}</code></pre>
                  </template>
                </div>
              </el-collapse-item>
            </el-collapse>
          </section>
        </div>
      </el-tab-pane>
    </el-tabs>

    <el-dialog v-model="formVisible" :title="editingId ? t('editApiKey') : t('createApiKey')" width="520px">
      <el-form label-position="top" @submit.prevent>
        <el-form-item :label="t('apiKeyName')" required>
          <el-input v-model="form.name" maxlength="60" show-word-limit />
        </el-form-item>
        <el-form-item :label="t('apiScopes')" required>
          <el-checkbox-group v-model="form.scopes" class="scope-options">
            <el-checkbox v-for="scope in scopeOptions" :key="scope.value" :value="scope.value">
              {{ t(scope.label) }}
            </el-checkbox>
          </el-checkbox-group>
        </el-form-item>
        <el-form-item :label="t('apiExpiresAt')">
          <el-date-picker
              v-model="form.expiresAt"
              type="datetime"
              :placeholder="t('apiNeverExpires')"
              style="width: 100%"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="formVisible = false">{{ t('cancel') }}</el-button>
        <el-button type="primary" :loading="saving" @click="submitForm">{{ t('save') }}</el-button>
      </template>
    </el-dialog>

    <el-dialog
        v-model="secretVisible"
        :title="t('apiKeyCreated')"
        width="560px"
        :close-on-click-modal="false"
    >
      <el-alert :title="t('apiKeyCreatedWarning')" type="warning" :closable="false" show-icon />
      <div class="secret-value">
        <code>{{ createdKey }}</code>
        <el-button circle type="primary" :aria-label="t('copy')" @click="copyText(createdKey)">
          <Icon icon="lucide:copy" width="17" height="17" />
        </el-button>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { Icon } from '@iconify/vue';
import { useI18n } from 'vue-i18n';
import { apiKeyCreate, apiKeyDelete, apiKeyList, apiKeyUpdate, openApiSpec } from '@/request/api-key.js';
import { tzDayjs } from '@/utils/day.js';

defineOptions({ name: 'api-management' });

const { t } = useI18n();
const activeTab = ref('keys');
const keys = reactive([]);
const loading = ref(false);
const docsLoading = ref(false);
const spec = ref(null);
const formVisible = ref(false);
const secretVisible = ref(false);
const saving = ref(false);
const editingId = ref(null);
const createdKey = ref('');
const form = reactive({ name: '', scopes: [], expiresAt: null });

const scopeOptions = [
  { value: 'users:read', label: 'apiScopeUsersRead' },
  { value: 'users:write', label: 'apiScopeUsersWrite' },
  { value: 'mailboxes:read', label: 'apiScopeMailboxesRead' },
  { value: 'mailboxes:write', label: 'apiScopeMailboxesWrite' },
  { value: 'emails:read', label: 'apiScopeEmailsRead' },
  { value: 'emails:write', label: 'apiScopeEmailsWrite' },
  { value: 'emails:send', label: 'apiScopeEmailsSend' }
];

const baseUrl = computed(() => spec.value?.servers?.[0]?.url || `${window.location.origin}/api/open/v1`);
const openApiUrl = computed(() => spec.value?.externalDocs?.url || `${baseUrl.value}/openapi.json`);
const agentGuidance = computed(() => spec.value?.['x-agent-guidance']);
const endpointGroups = computed(() => {
  if (!spec.value) return [];
  const methods = ['get', 'post', 'put', 'patch', 'delete'];
  return (spec.value.tags || []).map(tag => {
    const endpoints = [];
    Object.entries(spec.value.paths || {}).forEach(([path, pathItem]) => {
      methods.forEach(method => {
        const operation = pathItem[method];
        if (operation?.tags?.includes(tag.name)) {
          const responses = responseEntries(operation.responses);
          endpoints.push({
            method,
            path,
            summary: operation.summary,
            description: operation.description,
            scope: operation['x-scope'],
            parameters: operation.parameters || [],
            requestBody: operation.requestBody,
            requestFields: requestFields(operation.requestBody),
            responses,
            responseExample: responses.find(response => response.code.startsWith('2'))?.example
          });
        }
      });
    });
    return { ...tag, endpoints };
  }).filter(group => group.endpoints.length > 0);
});

onMounted(() => {
  loadKeys();
  loadDocs();
});

async function loadKeys() {
  loading.value = true;
  try {
    const data = await apiKeyList();
    keys.splice(0, keys.length, ...data);
  } finally {
    loading.value = false;
  }
}

async function loadDocs() {
  docsLoading.value = true;
  try {
    spec.value = await openApiSpec();
  } finally {
    docsLoading.value = false;
  }
}

function openCreate() {
  editingId.value = null;
  Object.assign(form, { name: '', scopes: [], expiresAt: null });
  formVisible.value = true;
}

function openEdit(row) {
  editingId.value = row.apiKeyId;
  Object.assign(form, {
    name: row.name,
    scopes: [...row.scopes],
    expiresAt: row.expiresAt ? new Date(row.expiresAt.replace(' ', 'T')) : null
  });
  formVisible.value = true;
}

async function submitForm() {
  if (!form.name.trim() || form.scopes.length === 0) {
    ElMessage.warning(t('apiScopes'));
    return;
  }

  saving.value = true;
  try {
    const payload = {
      name: form.name.trim(),
      scopes: form.scopes,
      expiresAt: form.expiresAt
    };
    if (editingId.value) {
      await apiKeyUpdate(editingId.value, payload);
    } else {
      const data = await apiKeyCreate(payload);
      createdKey.value = data.key;
      secretVisible.value = true;
    }
    formVisible.value = false;
    await loadKeys();
  } finally {
    saving.value = false;
  }
}

async function toggleStatus(row) {
  await apiKeyUpdate(row.apiKeyId, { status: row.status === 0 ? 1 : 0 });
  await loadKeys();
}

function removeKey(row) {
  ElMessageBox.confirm(t('apiKeyDeleteConfirm', { name: row.name }), {
    confirmButtonText: t('confirm'),
    cancelButtonText: t('cancel'),
    type: 'warning'
  }).then(async () => {
    await apiKeyDelete(row.apiKeyId);
    await loadKeys();
  });
}

function scopeLabel(scope) {
  const option = scopeOptions.find(item => item.value === scope);
  return option ? t(option.label) : scope;
}

function formatDate(value, emptyText) {
  return value ? tzDayjs(value).format('YYYY-MM-DD HH:mm') : emptyText;
}

function methodType(method) {
  return { get: 'success', post: 'primary', patch: 'warning', put: 'warning', delete: 'danger' }[method] || 'info';
}

function responseType(code) {
  const status = Number(code);
  if (status >= 500) return 'danger';
  if (status >= 400) return 'warning';
  return 'success';
}

function resolveRef(value) {
  if (!value?.$ref || !spec.value) return value;
  return value.$ref.replace(/^#\//, '').split('/').reduce((current, key) => current?.[key], spec.value);
}

function requestFields(requestBody) {
  const rawSchema = requestBody?.content?.['application/json']?.schema;
  const schema = resolveRef(rawSchema);
  const required = new Set(schema?.required || []);
  return Object.entries(schema?.properties || {}).map(([name, property]) => {
    const resolved = resolveRef(property) || property;
    return {
      name,
      required: required.has(name),
      type: schemaType(resolved),
      description: resolved.description || '',
      rules: schemaRules(resolved)
    };
  });
}

function responseEntries(responses = {}) {
  return Object.entries(responses).map(([code, response]) => {
    const resolved = resolveRef(response);
    return {
      code,
      description: resolved?.description || '',
      example: resolved?.content?.['application/json']?.example
    };
  });
}

function schemaType(schema = {}) {
  if (Array.isArray(schema.type)) return schema.type.join(' | ');
  if (schema.type === 'array') {
    const item = resolveRef(schema.items) || schema.items || {};
    return `array<${item.type || item.title || 'object'}>`;
  }
  const suffix = schema.format ? `:${schema.format}` : '';
  return `${schema.type || 'object'}${suffix}`;
}

function schemaRules(schema = {}) {
  const rules = [];
  if (schema.enum) rules.push(`enum: ${schema.enum.join(', ')}`);
  if (schema.default !== undefined) rules.push(`default: ${schema.default}`);
  if (schema.minimum !== undefined) rules.push(`min: ${schema.minimum}`);
  if (schema.maximum !== undefined) rules.push(`max: ${schema.maximum}`);
  if (schema.minLength !== undefined) rules.push(`minLength: ${schema.minLength}`);
  if (schema.maxLength !== undefined) rules.push(`maxLength: ${schema.maxLength}`);
  if (schema.minItems !== undefined) rules.push(`minItems: ${schema.minItems}`);
  if (schema.maxItems !== undefined) rules.push(`maxItems: ${schema.maxItems}`);
  if (schema.pattern) rules.push(`pattern: ${schema.pattern}`);
  return rules.join(' · ');
}

function formatJson(value) {
  return JSON.stringify(value, null, 2);
}

function agentGuideText() {
  const guidance = agentGuidance.value;
  if (!guidance) return '';

  const lines = [
    '# Cloud Mail API Agent Guide',
    '',
    `Base URL: ${baseUrl.value}`,
    `OpenAPI: ${openApiUrl.value}`,
    `Authentication: ${guidance.authentication}`,
    `Response: ${guidance.responseEnvelope}`,
    `Timestamps: ${guidance.timestamps}`
  ];

  appendList(lines, 'Prerequisites', guidance.prerequisites);
  lines.push('', 'Workflow:');
  guidance.temporaryMailboxWorkflow?.forEach(item => {
    lines.push(`${item.step}. ${item.method} ${item.path} - ${item.purpose}`);
  });
  lines.push('', `Polling: ${guidance.polling}`);
  lines.push(`Idempotency and retries: ${guidance.idempotency}`);
  appendList(lines, 'Error handling', Object.values(guidance.retryPolicy || {}));
  appendList(lines, 'Limitations', guidance.limitations);
  return lines.join('\n');
}

function appendList(lines, title, items) {
  if (!items?.length) return;
  lines.push('', `${title}:`);
  items.forEach(item => lines.push(`- ${item}`));
}

function curlExample(endpoint) {
  let path = endpoint.path.replace(/\{[^}]+}/g, '1');
  const query = endpoint.parameters
      .filter(parameter => parameter.in === 'query' && parameter.schema?.default !== undefined)
      .map(parameter => `${parameter.name}=${encodeURIComponent(parameter.schema.default)}`);
  if (query.length) path += `?${query.join('&')}`;
  const lines = [`curl -X ${endpoint.method.toUpperCase()} '${baseUrl.value}${path}'`];
  if (endpoint.scope) lines.push("  -H 'Authorization: Bearer <API_KEY>'");
  const example = endpoint.requestBody?.content?.['application/json']?.example;
  if (example) {
    lines.push("  -H 'Content-Type: application/json'");
    lines.push(`  -d '${JSON.stringify(example)}'`);
  }
  return lines.join(` ${String.fromCharCode(92)}\n`);
}

async function copyText(value) {
  await navigator.clipboard.writeText(value);
  ElMessage.success(t('copied'));
}
</script>

<style scoped lang="scss">
.api-page {
  height: 100%;
  overflow: auto;
  background: var(--settings-page-background);
  color: var(--el-text-color-primary);
}

.page-header {
  min-height: 82px;
  padding: 18px 24px 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  border-bottom: 1px solid var(--el-border-color-light);

  h1 {
    margin: 0;
    font-size: 21px;
    line-height: 1.3;
    letter-spacing: 0;
  }

  .el-button {
    flex-shrink: 0;
    gap: 7px;
  }
}

.api-tabs {
  padding: 0 24px 32px;
}

:deep(.el-tabs__header) {
  margin-bottom: 0;
}

.table-toolbar {
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

.key-table {
  width: 100%;
  border-top: 1px solid var(--el-border-color-lighter);
}

.mobile-key-list {
  display: none;
}

.key-name {
  display: grid;
  gap: 4px;

  span {
    font-weight: 600;
  }

  code {
    color: var(--el-text-color-secondary);
    font-size: 12px;
  }
}

.scope-list {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.row-actions {
  display: flex;
  align-items: center;
}

.docs-pane {
  min-height: 420px;
  padding-top: 20px;
}

.connection-band {
  padding: 10px 14px;
  display: grid;
  gap: 8px;
  border: 1px solid var(--el-border-color);
  border-radius: 6px;
  background: var(--el-bg-color);
}

.connection-row {
  min-height: 34px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;

  > div:first-child {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 12px;
  }

  code {
    overflow-wrap: anywhere;
    color: var(--el-color-primary);
  }
}

.band-label {
  flex-shrink: 0;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
}

.auth-note {
	margin: 14px 0;
  padding: 12px 14px;
  display: flex;
  gap: 12px;
  align-items: flex-start;
  border-left: 3px solid var(--el-color-primary);
  background: var(--el-fill-color-light);

  p {
    margin: 3px 0 0;
    color: var(--el-text-color-secondary);
    font-size: 13px;
  }
}

.agent-guide {
  margin: 0 0 28px;
  padding: 16px 0;
  border-top: 1px solid var(--el-border-color-lighter);
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.agent-guide-heading {
  display: flex;
  align-items: flex-start;
  gap: 10px;

  h2 {
    margin: 0;
    font-size: 15px;
    letter-spacing: 0;
  }

  p {
    margin: 3px 0 0;
    color: var(--el-text-color-secondary);
    font-size: 12px;
  }

  > .el-button {
    flex-shrink: 0;
    margin-left: auto;
  }
}

.workflow-list {
  margin: 14px 0;
  padding: 0;
  display: grid;
  gap: 8px;
  list-style: none;

  li {
    display: grid;
    grid-template-columns: 24px minmax(250px, 0.8fr) minmax(220px, 1.2fr);
    align-items: center;
    gap: 10px;
    color: var(--el-text-color-secondary);
    font-size: 12px;
  }

  code {
    color: var(--el-color-primary);
    overflow-wrap: anywhere;
  }
}

.workflow-step {
  width: 22px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--el-border-color);
  border-radius: 50%;
  color: var(--el-text-color-primary);
  font-size: 11px;
  font-weight: 700;
}

.guidance-notes {
  margin: 0;
  display: grid;
  gap: 5px;

  > div {
    display: grid;
    grid-template-columns: 82px minmax(0, 1fr);
    gap: 10px;
  }

  dt {
    font-size: 12px;
    font-weight: 700;
  }

  dd {
    margin: 0;
    color: var(--el-text-color-secondary);
    font-size: 12px;

    ul {
      margin: 0;
      padding-left: 18px;
    }

    li + li {
      margin-top: 3px;
    }
  }
}

.endpoint-group {
  margin-top: 28px;
}

.group-heading {
  margin-bottom: 10px;

  h2 {
    margin: 0;
    font-size: 17px;
    letter-spacing: 0;
  }

  p {
    margin: 4px 0 0;
    color: var(--el-text-color-secondary);
    font-size: 13px;
  }
}

.endpoint-title {
  min-width: 0;
  width: 100%;
  display: grid;
  grid-template-columns: 72px minmax(160px, 1fr) minmax(180px, 1.3fr) auto;
  align-items: center;
  gap: 12px;
  padding-right: 10px;

  code {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  > span {
    color: var(--el-text-color-regular);
  }
}

.method-tag {
  width: 66px;
  justify-content: center;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-weight: 700;
}

.endpoint-body {
  padding: 4px 6px 16px;

  > p {
    color: var(--el-text-color-secondary);
  }

  pre {
    margin: 0;
    padding: 14px;
    overflow: auto;
    border-radius: 6px;
    background: #111827;
    color: #e5e7eb;
    line-height: 1.55;
  }
}

.doc-section {
  margin: 16px 0;

  h3 {
    margin: 0 0 8px;
    font-size: 13px;
    letter-spacing: 0;
  }
}

.field-table {
  border-top: 1px solid var(--el-border-color-lighter);
}

.field-row {
  min-height: 42px;
  padding: 8px 0;
  display: grid;
  grid-template-columns: minmax(110px, 0.8fr) minmax(120px, 0.7fr) 72px minmax(220px, 2fr);
  align-items: center;
  gap: 10px;
  border-bottom: 1px solid var(--el-border-color-lighter);

  code {
    overflow-wrap: anywhere;
    color: var(--el-color-primary);
    font-weight: 600;
  }
}

.field-description small {
  display: block;
  margin-top: 3px;
  color: var(--el-text-color-placeholder);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  overflow-wrap: anywhere;
}

.field-meta,
.field-optional,
.field-description,
.response-list {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.response-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 18px;

  > span {
    display: flex;
    align-items: center;
    gap: 7px;
  }
}

.code-heading {
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  font-weight: 600;
}

.scope-options {
  width: 100%;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 4px 12px;
}

.secret-value {
  margin-top: 18px;
  padding: 12px;
  display: flex;
  align-items: center;
  gap: 12px;
  border: 1px solid var(--el-border-color);
  border-radius: 6px;
  background: var(--el-fill-color-light);

  code {
    min-width: 0;
    flex: 1;
    overflow-wrap: anywhere;
    line-height: 1.55;
  }
}

@media (max-width: 767px) {
  .page-header {
    padding: 16px;
    align-items: flex-start;
    flex-direction: column;
  }

  .api-tabs {
    padding: 0 12px 24px;
  }

  .endpoint-title {
    grid-template-columns: 62px minmax(0, 1fr);
    grid-template-areas:
      'method path'
      '. summary'
      '. scope';
    gap: 7px;

    .method-tag {
      grid-area: method;
    }

    code {
      grid-area: path;
      overflow: visible;
      text-overflow: clip;
      white-space: normal;
      overflow-wrap: anywhere;
    }

    .endpoint-summary {
      grid-area: summary;
    }

    .endpoint-scope {
      grid-area: scope;
      justify-self: start;
    }
  }

  .method-tag {
    width: 56px;
  }

  .connection-row > div:first-child {
    align-items: flex-start;
    flex-direction: column;
    gap: 4px;
  }

  .workflow-list li {
    grid-template-columns: 24px minmax(0, 1fr);

    > span:last-child {
      grid-column: 2;
    }
  }

  .guidance-notes > div {
    grid-template-columns: 1fr;
    gap: 2px;
  }

  .scope-options {
    grid-template-columns: 1fr;
  }

  .key-table {
    display: none;
  }

  .mobile-key-list {
    display: grid;
    gap: 10px;
  }

  .mobile-key-item {
    padding: 12px;
    display: grid;
    gap: 11px;
    border: 1px solid var(--el-border-color-light);
    border-radius: 6px;
    background: var(--el-bg-color);

    .row-actions {
      justify-content: flex-end;
      border-top: 1px solid var(--el-border-color-lighter);
      padding-top: 6px;
    }
  }

  .mobile-key-heading {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }

  .mobile-key-meta {
    display: grid;
    gap: 4px;
    color: var(--el-text-color-secondary);
    font-size: 12px;
  }

  .field-row {
    grid-template-columns: minmax(0, 1fr) auto;

    .field-meta,
    .field-description {
      grid-column: 1 / -1;
    }
  }
}
</style>
