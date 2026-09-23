// A projection of the fields the buyer comparator actually measures, not a
// general JSON Schema validator. References stay inside the retained document;
// an unsupported or ambiguous composition is missing evidence, never agreement.
const canonical = value => JSON.stringify(value, (_key, x) => x && typeof x === 'object' && !Array.isArray(x)
  ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b))) : x);

export function normalizeBuyerSchema(schema, document = schema) {
  if (schema == null) return undefined;
  let visited = 0;
  function nodes(value, active = new Set(), depth = 0) {
    if (++visited > 2048 || depth > 32) throw new Error('schema_budget');
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('unsupported_schema');
    if (active.has(value)) throw new Error('cyclic_reference');
    if (['anyOf', 'oneOf', 'not', 'if', 'then', 'else', '$dynamicRef', '$recursiveRef', '$id', 'dependentSchemas', 'dependentRequired'].some(k => k in value)) throw new Error('unsupported_composition');
    const next = new Set(active).add(value), result = [value];
    if ('$ref' in value) {
      if (typeof value.$ref !== 'string' || !value.$ref.startsWith('#/')) throw new Error('nonlocal_reference');
      let target = document;
      let pointer;
      try { pointer = decodeURIComponent(value.$ref.slice(2)); } catch { throw new Error('invalid_reference'); }
      for (const part of pointer.split('/')) {
        if (/~(?![01])/u.test(part)) throw new Error('invalid_reference');
        const key = part.replaceAll('~1', '/').replaceAll('~0', '~');
        if (!target || typeof target !== 'object' || !Object.hasOwn(target, key)) throw new Error('unresolved_reference');
        target = target[key];
      }
      result.push(...nodes(target, next, depth + 1));
    }
    if ('allOf' in value) {
      if (!Array.isArray(value.allOf) || !value.allOf.length) throw new Error('unsupported_composition');
      for (const part of value.allOf) result.push(...nodes(part, next, depth + 1));
    }
    return result;
  }
  const required = new Set(), properties = new Map();
  for (const part of nodes(schema)) {
    if (part.required !== undefined && (!Array.isArray(part.required) || part.required.some(k => typeof k !== 'string'))) throw new Error('invalid_required');
    for (const key of part.required ?? []) required.add(key);
    if (part.properties !== undefined && (!part.properties || typeof part.properties !== 'object' || Array.isArray(part.properties))) throw new Error('invalid_properties');
    for (const [name, property] of Object.entries(part.properties ?? {})) {
      const projected = properties.get(name) ?? {};
      for (const constraint of nodes(property)) for (const field of ['type', 'maxLength', 'minLength', 'enum']) {
        if (constraint[field] === undefined) continue;
        // Intersections with different constraints need a fuller validator.
        // Refuse to pick one branch and accidentally erase the other.
        if (Object.hasOwn(projected, field) && canonical(projected[field]) !== canonical(constraint[field])) throw new Error('overlapping_constraints');
        projected[field] = constraint[field];
      }
      properties.set(name, projected);
    }
  }
  return { required: [...required].sort(), properties: Object.fromEntries(properties) };
}

export function compareBuyerContracts({ menu, openapi, manifest }) {
  return menu.items.map(i => {
    const m = manifest.resources.find(r => new URL(r.resource).pathname === '/api/buy/' + i.id);
    const o = openapi.paths['/api/buy/' + i.id]?.get;
    const issues = [], compared_fields = [];
    const compare = (field, a, b) => {
      compared_fields.push(field);
      if (a == null || b == null) issues.push({ field, kind: 'missing', left: a ?? null, right: b ?? null });
      else if (canonical(a) !== canonical(b)) issues.push({ field, kind: 'contradiction', left: a, right: b });
    };
    const schemas = (field, a, aDoc, b, bDoc) => {
      const values = [];
      for (const [side, schema, document] of [['left', a, aDoc], ['right', b, bDoc]]) {
        try { values.push(normalizeBuyerSchema(schema, document)); }
        catch (error) {
          compared_fields.push(field);
          issues.push({ field, kind: 'missing', reason: 'unresolved_schema', side, detail: error.message });
          return;
        }
      }
      compare(field, ...values);
    };
    compare('manifest price', i.price_tiers_usdc, m?.price_usdc_options);
    compare('manifest fulfillment', i.fulfillment, m?.fulfillment);
    schemas('manifest input schema', i.spec.inputs, menu, m?.inputSchema, manifest);
    compare('OpenAPI price', i.price_tiers_usdc, o?.['x-payment']?.price_usdc_options);
    const legacy = o?.['x-request-schema'], current = o?.['x-payment-info']?.input?.schema;
    schemas('OpenAPI inputs', i.spec.inputs, menu, current ?? legacy, openapi);
    if (current != null && legacy != null) schemas('OpenAPI duplicate inputs', current, openapi, legacy, openapi);
    compare('manifest spec', i.spec, m?.spec);
    return { item: i.id, compared_fields, issues };
  });
}
