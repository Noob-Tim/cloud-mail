import { describe, expect, it } from 'vitest';
import { createOpenApiSpec } from '../../src/openapi/openapi-spec';

describe('open api specification', () => {
	const spec = createOpenApiSpec('https://mail.example.com');
  const methods = new Set(['get', 'post', 'put', 'patch', 'delete']);
  const operations = Object.values(spec.paths).flatMap(pathItem =>
    Object.entries(pathItem)
      .filter(([method]) => methods.has(method))
      .map(([, operation]) => operation)
  );

	it('uses the deployed origin and exposes the required resources', () => {
		expect(spec.servers[0].url).toBe('https://mail.example.com/api/open/v1');
		expect(spec.paths).toHaveProperty('/users');
		expect(spec.paths).toHaveProperty('/users/{userId}/mailboxes');
		expect(spec.paths).toHaveProperty('/temp-mailboxes');
		expect(spec.paths).toHaveProperty('/temp-mailboxes/{accountId}');
		expect(spec.paths).toHaveProperty('/emails/{emailId}');
		expect(spec.paths).toHaveProperty('/emails/send');
		expect(spec.components.schemas.TempMailboxCreate.properties.ttlMinutes.maximum).toBe(10080);
    expect(spec.externalDocs.url).toBe('https://mail.example.com/api/open/v1/openapi.json');
    expect(spec.security).toEqual([{ BearerAuth: [] }, { ApiKeyHeader: [] }]);
	});

	it('declares a scope for every protected operation', () => {
    for (const operation of operations) {
      if (operation.security?.length === 0) continue;
      expect(operation['x-scope']).toMatch(/^[a-z]+:(read|write|send)$/);
		}
	});

  it('gives every operation a unique machine-readable id', () => {
    const operationIds = operations.map(operation => operation.operationId);
    expect(operationIds).toHaveLength(18);
    expect(new Set(operationIds).size).toBe(operationIds.length);
  });

  it('documents typed success envelopes and concrete examples', () => {
    for (const operation of operations.filter(operation => operation['x-scope'])) {
      const json = operation.responses[200].content['application/json'];
      expect(json.schema).toBeTruthy();
      expect(json).toHaveProperty('example');
    }
  });

  it('documents request examples, conflicts, mailbox deletion filters, and agent workflow', () => {
    for (const operation of operations.filter(operation => operation.requestBody)) {
      expect(operation.requestBody.content['application/json']).toHaveProperty('example');
    }

    expect(spec.paths['/users'].post.responses).toHaveProperty('409');
    expect(spec.paths['/temp-mailboxes'].post.responses).toHaveProperty('409');
    expect(spec.paths['/users/{userId}/mailboxes'].get.parameters).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'deleted', in: 'query' })])
    );
    expect(spec['x-agent-guidance'].temporaryMailboxWorkflow).toHaveLength(4);
    expect(spec['x-agent-guidance'].polling).toContain('1-3');
    expect(spec['x-agent-guidance'].prerequisites).toEqual(expect.arrayContaining([
      expect.stringContaining('users:read')
    ]));
    expect(spec.paths['/emails'].get.parameters.find(parameter => parameter.name === 'unread').schema).not.toHaveProperty('default');
    expect(spec.components.schemas.MailboxSummary.properties).toHaveProperty('isDeleted');
    expect(spec.components.schemas.Mailbox.properties).toHaveProperty('isDel');
  });
});
