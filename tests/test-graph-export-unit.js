/**
 * 测试 lib/graph-export.js — 统一图谱导出/导入模块
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const {
  generateEntityId,
  normalizeEntity,
  normalizeRelation,
  exportToJSONLD,
  exportEntities,
  exportRelations,
  exportIncremental,
  JSONLD_CONTEXT,
} = await import('../lib/graph-export.js');

// ==================== generateEntityId ====================

describe('GraphExport — generateEntityId', () => {

  it('1. 正常生成 ID', () => {
    const id = generateEntityId('React', 'framework');
    assert.equal(id, 'pw:framework:react');
  });

  it('2. 空名称处理', () => {
    const id = generateEntityId('', 'tool');
    assert.equal(id, 'pw:tool:');
  });

  it('3. 空类型使用 other', () => {
    const id = generateEntityId('Test', '');
    assert.equal(id, 'pw:other:test');
  });

  it('4. null 参数处理', () => {
    const id = generateEntityId(null, null);
    assert.equal(id, 'pw:other:');
  });

  it('5. 大小写规范化', () => {
    const id = generateEntityId('NODE.JS', 'Language');
    assert.equal(id, 'pw:language:node.js');
  });
});

// ==================== normalizeEntity ====================

describe('GraphExport — normalizeEntity', () => {

  it('6. null 返回 null', () => {
    assert.equal(normalizeEntity(null), null);
  });

  it('7. 从 node.label 提取名称', () => {
    const result = normalizeEntity({ id: '1', label: 'Test Node', nodeType: 'person' });
    assert.equal(result.name, 'Test Node');
    assert.equal(result.type, 'person');
    assert.equal(result.id, '1');
  });

  it('8. 从 entry.name 提取名称', () => {
    const result = normalizeEntity({ id: '2', entry: { name: 'Entry Name', type: 'concept' } });
    assert.equal(result.name, 'Entry Name');
    assert.equal(result.type, 'concept');
  });

  it('9. 默认类型 other', () => {
    const result = normalizeEntity({ id: '3', label: 'Unknown' });
    assert.equal(result.type, 'other');
  });

  it('10. 保留非内部属性', () => {
    const result = normalizeEntity({
      id: '4',
      label: 'Test',
      entry: { description: 'desc', color: 'red', createdAt: '2024-01-01' }
    });
    assert.equal(result.properties.description, 'desc');
    assert.ok(!('color' in result.properties)); // color is skipped
    assert.equal(result.properties.createdAt, '2024-01-01');
  });

  it('11. 附加 tags', () => {
    const result = normalizeEntity({ id: '5', label: 'Tagged', tags: ['a', 'b'] });
    assert.deepEqual(result.properties.tags, ['a', 'b']);
  });

  it('12. 无 ID 时生成确定性 ID', () => {
    const result = normalizeEntity({ id: null, label: 'No ID', nodeType: 'article' });
    assert.equal(result.id, 'pw:article:no id');
  });
});

// ==================== normalizeRelation ====================

describe('GraphExport — normalizeRelation', () => {

  it('13. null 返回 null', () => {
    assert.equal(normalizeRelation(null), null);
  });

  it('14. 正常标准化关系', () => {
    const result = normalizeRelation({ source: 'a', target: 'b', edgeType: 'related', weight: 0.8 });
    assert.equal(result.source, 'a');
    assert.equal(result.target, 'b');
    assert.equal(result.type, 'related');
    assert.equal(result.weight, 0.8);
  });

  it('15. 默认类型 relation', () => {
    const result = normalizeRelation({ source: 'a', target: 'b' });
    assert.equal(result.type, 'relation');
    assert.equal(result.weight, 0.5);
  });

  it('16. weight 裁剪到 [0, 1]', () => {
    assert.equal(normalizeRelation({ source: 'a', target: 'b', weight: 1.5 }).weight, 1);
    assert.equal(normalizeRelation({ source: 'a', target: 'b', weight: -0.5 }).weight, 0);
  });
});

// ==================== exportToJSONLD ====================

describe('GraphExport — exportToJSONLD', () => {

  it('17. null 输入返回空图谱', () => {
    const result = exportToJSONLD(null);
    assert.equal(result['pw:entities'].length, 0);
    assert.equal(result['pw:relations'].length, 0);
    assert.equal(result['@type'], 'pw:KnowledgeGraph');
  });

  it('18. 自定义 graphId 和 source', () => {
    const result = exportToJSONLD(null, { graphId: 'pw:test', source: 'docmind' });
    assert.equal(result['@id'], 'pw:test');
    assert.equal(result['pw:source'], 'docmind');
  });

  it('19. 正常导出图谱数据', () => {
    const graphData = {
      nodes: [
        { id: '1', label: 'Node A', nodeType: 'person', entry: {} },
        { id: '2', label: 'Node B', nodeType: 'concept', entry: {} },
      ],
      edges: [
        { source: '1', target: '2', edgeType: 'related', weight: 0.7 },
      ],
    };
    const result = exportToJSONLD(graphData);
    assert.equal(result['pw:entities'].length, 2);
    assert.equal(result['pw:relations'].length, 1);
    assert.equal(result['pw:entityCount'], 2);
    assert.equal(result['pw:relationCount'], 1);
  });

  it('20. JSONLD_CONTEXT 包含 @context', () => {
    assert.ok(JSONLD_CONTEXT['@context']);
    assert.ok(JSONLD_CONTEXT['@context'].pw);
  });

  it('21. 导出结果包含 exportedAt', () => {
    const result = exportToJSONLD(null);
    assert.ok(result['pw:exportedAt']);
  });
});

// ==================== exportEntities / exportRelations ====================

describe('GraphExport — exportEntities / exportRelations', () => {

  it('22. exportEntities null 返回空', () => {
    assert.deepEqual(exportEntities(null), []);
  });

  it('23. exportEntities 正常工作', () => {
    const entities = exportEntities({
      nodes: [{ id: '1', label: 'A', entry: {} }],
    });
    assert.equal(entities.length, 1);
    assert.equal(entities[0].name, 'A');
  });

  it('24. exportRelations null 返回空', () => {
    assert.deepEqual(exportRelations(null), []);
  });

  it('25. exportRelations 正常工作', () => {
    const relations = exportRelations({
      edges: [{ source: 'a', target: 'b', weight: 0.5 }],
    });
    assert.equal(relations.length, 1);
    assert.equal(relations[0].source, 'a');
  });
});

// ==================== exportIncremental ====================

describe('GraphExport — exportIncremental', () => {

  it('26. null graphData 返回空', () => {
    const result = exportIncremental(null, '2024-01-01');
    assert.equal(result['pw:entities'].length, 0);
  });

  it('27. 无效 sinceTimestamp 返回全量', () => {
    const result = exportIncremental({ nodes: [{ id: '1', label: 'A', entry: {} }], edges: [] }, 'invalid');
    assert.equal(result['pw:entities'].length, 1);
  });

  it('28. 只导出变更后的节点', () => {
    const graphData = {
      nodes: [
        { id: '1', label: 'Old', entry: { updatedAt: '2024-01-01' } },
        { id: '2', label: 'New', entry: { updatedAt: '2024-06-01' } },
      ],
      edges: [],
    };
    const result = exportIncremental(graphData, '2024-03-01');
    assert.equal(result['pw:entities'].length, 1);
    assert.equal(result['pw:entities'][0].name, 'New');
    assert.ok(result['pw:incrementalSince']);
  });

  it('29. 相关边也会被包含', () => {
    const graphData = {
      nodes: [
        { id: '1', label: 'Old', entry: { updatedAt: '2024-01-01' } },
        { id: '2', label: 'New', entry: { updatedAt: '2024-06-01' } },
      ],
      edges: [
        { source: '1', target: '2', weight: 0.5 },
      ],
    };
    const result = exportIncremental(graphData, '2024-03-01');
    assert.equal(result['pw:relations'].length, 1);
  });
});
