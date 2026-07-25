import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { disconnectPrisma, prisma } from '../../lib/prisma.js';
import { ProjectService } from '../../services/ProjectService.js';

if (process.env.RUN_REAL_INFRASTRUCTURE !== '1') {
  throw new Error(
    'ProjectService.postgres.test.ts requires RUN_REAL_INFRASTRUCTURE=1 and a migrated test database.',
  );
}

const createdProjectIds: string[] = [];

async function createProject() {
  const id = `infra-project-${randomUUID()}`;
  createdProjectIds.push(id);
  return prisma.project.create({
    data: {
      id,
      userId: 'infra-owner',
      title: 'Infrastructure project',
      data: { objects: [] },
      collaborators: {
        create: { userId: 'infra-editor', role: 'editor' },
      },
    },
  });
}

describe('ProjectService PostgreSQL integration', () => {
  beforeEach(async () => {
    await prisma.$queryRaw`SELECT 1`;
  });

  afterEach(async () => {
    await prisma.project.deleteMany({ where: { id: { in: createdProjectIds.splice(0) } } });
  });

  afterAll(async () => {
    await disconnectPrisma();
  });

  it('accepts exactly one concurrent revision, records an idempotency receipt, and cascades it', async () => {
    const project = await createProject();
    const service = new ProjectService();

    const [first, second] = await Promise.all([
      service.commitCollaborationOperation({
        projectId: project.id,
        userId: 'infra-editor',
        operationId: `operation-${randomUUID()}`,
        expectedRevision: project.revision,
        kind: 'replace-project',
        title: 'First competing update',
        data: { objects: [{ id: 'first' }] },
      }),
      service.commitCollaborationOperation({
        projectId: project.id,
        userId: 'infra-owner',
        operationId: `operation-${randomUUID()}`,
        expectedRevision: project.revision,
        kind: 'replace-project',
        title: 'Second competing update',
        data: { objects: [{ id: 'second' }] },
      }),
    ]);

    const results = [first, second];
    const applied = results.find((result) => result.status === 'applied');
    const conflict = results.find((result) => result.status === 'conflict');
    expect(applied).toMatchObject({ status: 'applied', revision: project.revision + 1 });
    expect(conflict).toMatchObject({
      status: 'conflict',
      currentRevision: project.revision + 1,
    });

    const persisted = await prisma.project.findUniqueOrThrow({ where: { id: project.id } });
    expect(persisted).toMatchObject({
      revision: project.revision + 1,
      title: applied?.status === 'applied' ? applied.title : undefined,
      data: applied?.status === 'applied' ? applied.data : undefined,
    });
    expect(await prisma.collaborationOperation.count({ where: { projectId: project.id } })).toBe(1);

    if (applied?.status !== 'applied') throw new Error('Expected an applied operation');
    await expect(
      service.commitCollaborationOperation({
        projectId: project.id,
        userId: applied.operationId === first.operationId ? 'infra-editor' : 'infra-owner',
        operationId: applied.operationId,
        expectedRevision: project.revision,
        kind: 'replace-project',
        title: applied.title,
        data: applied.data,
      }),
    ).resolves.toMatchObject({
      status: 'duplicate',
      operationId: applied.operationId,
      revision: project.revision + 1,
    });

    await prisma.project.delete({ where: { id: project.id } });
    createdProjectIds.splice(createdProjectIds.indexOf(project.id), 1);
    expect(await prisma.collaborationOperation.count({ where: { projectId: project.id } })).toBe(0);
    expect(await prisma.projectCollaborator.count({ where: { projectId: project.id } })).toBe(0);
  });
});
