import type { ArchitectureGraph } from './architecture-graph.ts';

export interface ArchitecturePackReport {
  readonly repo: RepositoryPackSummary;
  readonly task: string;
  readonly services: readonly ServicePackSummary[];
  readonly data: DataPackSummary;
  readonly events: EventPackSummary;
  readonly externalProviders: readonly string[];
  readonly boundaries: readonly string[];
}

export interface RepositoryPackSummary {
  readonly name: string;
  readonly status: string | null;
  readonly repoStage: string | null;
  readonly kind: string | null;
  readonly area: string | null;
  readonly purpose: string | null;
  readonly owner: string | null;
  readonly riskLevel: string | null;
  readonly currentLocation: string | null;
  readonly createWhen: readonly string[];
  readonly splitTrigger: readonly string[];
  readonly ownsData: readonly string[];
}

export interface ServicePackSummary {
  readonly id: string;
  readonly repo: string | null;
  readonly tier: string | null;
  readonly runtime: string | null;
  readonly directDatastoreAccess: readonly string[];
  readonly datastoreDependencies: readonly string[];
  readonly serviceDependencies: readonly string[];
  readonly dataClasses: readonly string[];
  readonly producedEvents: readonly string[];
  readonly consumedEvents: readonly string[];
  readonly externalProviders: readonly string[];
}

export interface DataPackSummary {
  readonly ownedClasses: readonly string[];
  readonly serviceDataClasses: readonly string[];
  readonly directDatastores: readonly string[];
  readonly datastoreDependencies: readonly string[];
}

export interface EventPackSummary {
  readonly produced: readonly string[];
  readonly consumed: readonly string[];
}

export function createArchitecturePackReport(input: {
  readonly graph: ArchitectureGraph;
  readonly repo: string;
  readonly task: string;
}): ArchitecturePackReport {
  const repository = findRepository(input.graph.catalogs.repositories, input.repo);

  if (repository === null) {
    throw new Error(`Repository \`${input.repo}\` was not found in catalogs/repositories.yaml.`);
  }

  const services = findServicesForRepository(input.graph.catalogs.services, input.repo);
  const serviceSummaries = services.map((service) => summarizeService(service));
  const serviceDataClasses = unique(serviceSummaries.flatMap((service) => service.dataClasses));
  const directDatastores = unique(
    serviceSummaries.flatMap((service) => service.directDatastoreAccess)
  );
  const datastoreDependencies = unique(
    serviceSummaries.flatMap((service) => service.datastoreDependencies)
  );
  const producedEvents = unique(
    serviceSummaries.flatMap((service) => service.producedEvents)
  );
  const consumedEvents = unique(
    serviceSummaries.flatMap((service) => service.consumedEvents)
  );
  const externalProviders = unique(
    serviceSummaries.flatMap((service) => service.externalProviders)
  );

  return {
    repo: summarizeRepository(repository),
    task: input.task,
    services: serviceSummaries,
    data: {
      ownedClasses: readStringArray(repository.owns_data),
      serviceDataClasses,
      directDatastores,
      datastoreDependencies
    },
    events: {
      produced: producedEvents,
      consumed: consumedEvents
    },
    externalProviders,
    boundaries: buildBoundaryNotes({
      repository,
      services: serviceSummaries,
      directDatastores,
      datastoreDependencies
    })
  };
}

export function formatArchitecturePackReportText(report: ArchitecturePackReport): string {
  return [
    `# ${report.repo.name} 작업 팩`,
    '',
    `작업: ${report.task}`,
    '',
    '## 저장소',
    `- 상태: ${formatNullable(report.repo.status)}`,
    `- 단계: ${formatNullable(report.repo.repoStage)}`,
    `- 종류: ${formatNullable(report.repo.kind)}`,
    `- 영역: ${formatNullable(report.repo.area)}`,
    `- 위험도: ${formatNullable(report.repo.riskLevel)}`,
    `- 소유자: ${formatNullable(report.repo.owner)}`,
    `- 목적: ${formatNullable(report.repo.purpose)}`,
    `- 현재 위치: ${formatNullable(report.repo.currentLocation)}`,
    '',
    '## 생성 조건',
    ...formatList(report.repo.createWhen),
    '',
    '## 분리 조건',
    ...formatList(report.repo.splitTrigger),
    '',
    '## 서비스',
    ...formatServices(report.services),
    '',
    '## 데이터',
    `- 소유 데이터: ${formatInlineList(report.data.ownedClasses)}`,
    `- 서비스 데이터 클래스: ${formatInlineList(report.data.serviceDataClasses)}`,
    `- 직접 접근 데이터 저장소: ${formatInlineList(report.data.directDatastores)}`,
    `- 의존 데이터 저장소: ${formatInlineList(report.data.datastoreDependencies)}`,
    '',
    '## 이벤트',
    `- 생산: ${formatInlineList(report.events.produced)}`,
    `- 소비: ${formatInlineList(report.events.consumed)}`,
    '',
    '## 외부 제공자',
    ...formatList(report.externalProviders),
    '',
    '## 경계 메모',
    ...formatList(report.boundaries)
  ].join('\n');
}

function summarizeRepository(repository: Record<string, unknown>): RepositoryPackSummary {
  return {
    name: readStringField(repository, 'name') ?? '',
    status: readStringField(repository, 'status'),
    repoStage: readStringField(repository, 'repo_stage'),
    kind: readStringField(repository, 'kind'),
    area: readStringField(repository, 'area'),
    purpose: readStringField(repository, 'purpose'),
    owner: readStringField(repository, 'owner'),
    riskLevel: readStringField(repository, 'risk_level'),
    currentLocation: readStringField(repository, 'current_location'),
    createWhen: readStringArray(repository.create_when),
    splitTrigger: readStringArray(repository.split_trigger),
    ownsData: readStringArray(repository.owns_data)
  };
}

function summarizeService(service: Record<string, unknown>): ServicePackSummary {
  return {
    id: readStringField(service, 'id') ?? '',
    repo: readStringField(service, 'repo'),
    tier: readNestedStringField(service, 'tier') ?? readNestedStringField(service, 'service.tier'),
    runtime:
      readNestedStringField(service, 'runtime') ??
      readNestedStringField(service, 'runtime.core') ??
      readNestedStringField(service, 'runtime.deploy_target'),
    directDatastoreAccess: unique([
      ...readStringArray(service.direct_datastore_access),
      ...readNestedStringArray(service, 'data.direct_datastore_access'),
      ...readNestedStringArray(service, 'data.datastores')
    ]),
    datastoreDependencies: readNestedStringArray(service, 'dependencies.datastores'),
    serviceDependencies: unique([
      ...readStringArray(service.dependencies),
      ...readNestedStringArray(service, 'dependencies.services')
    ]),
    dataClasses: readNestedStringArray(service, 'data.classes'),
    producedEvents: readEventReferences(service, 'events.produced'),
    consumedEvents: readEventReferences(service, 'events.consumed'),
    externalProviders: unique([
      ...readStringArray(service.external_dependencies),
      ...readProviderEntries(service.providers)
    ])
  };
}

function buildBoundaryNotes(input: {
  readonly repository: Record<string, unknown>;
  readonly services: readonly ServicePackSummary[];
  readonly directDatastores: readonly string[];
  readonly datastoreDependencies: readonly string[];
}): readonly string[] {
  const notes: string[] = [];
  const repoStage = readStringField(input.repository, 'repo_stage');
  const kind = readStringField(input.repository, 'kind');
  const riskLevel = readStringField(input.repository, 'risk_level');

  if (repoStage !== 'deploy_unit') {
    notes.push(
      `repo_stage가 ${formatNullable(repoStage)}이므로 실제 독립 저장소 생성 대상인지 catalog의 create_when/current_location을 먼저 확인한다.`
    );
  }

  if (kind !== 'deploy_unit') {
    notes.push(
      `kind가 ${formatNullable(kind)}이므로 배포 단위처럼 다루기 전에 논리 경계인지 확인한다.`
    );
  }

  if (riskLevel === 'high' || riskLevel === 'critical') {
    notes.push('위험도가 높으므로 돈, 권한, 개인정보, AI 사용자 데이터, 감사 경계는 보수적으로 검증한다.');
  }

  if (input.services.length === 0) {
    notes.push('catalogs/services.yaml에 연결된 서비스가 없으므로 service.yaml 작성 시 중앙 서비스 카탈로그 등록도 함께 검토한다.');
  }

  if (input.directDatastores.length === 0) {
    notes.push('직접 접근 데이터 저장소가 없으면 데이터는 소유 서비스 API나 이벤트를 통해 다룬다.');
  }

  if (input.datastoreDependencies.length > 0) {
    notes.push('데이터 저장소 의존성은 직접 접근 금지선과 원장/개인정보/credential 경계를 다시 확인한다.');
  }

  return notes;
}

function findRepository(value: unknown, repo: string): Record<string, unknown> | null {
  if (!isRecord(value) || !Array.isArray(value.repositories)) {
    return null;
  }

  return (
    value.repositories.find(
      (repository): repository is Record<string, unknown> =>
        isRecord(repository) && readStringField(repository, 'name') === repo
    ) ?? null
  );
}

function findServicesForRepository(
  value: unknown,
  repo: string
): readonly Record<string, unknown>[] {
  if (!isRecord(value) || !Array.isArray(value.services)) {
    return [];
  }

  return value.services.filter(
    (service): service is Record<string, unknown> =>
      isRecord(service) && readStringField(service, 'repo') === repo
  );
}

function readProviderEntries(value: unknown): readonly string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((provider) => {
    if (!isRecord(provider)) {
      return [];
    }

    const id = readStringField(provider, 'id');

    return id === null ? [] : [id];
  });
}

function readEventReferences(
  value: Record<string, unknown>,
  path: string
): readonly string[] {
  const events = readValueAtPath(value, path);

  if (!Array.isArray(events)) {
    return [];
  }

  return unique(
    events.flatMap((eventValue) => {
      if (typeof eventValue === 'string' && eventValue.trim().length > 0) {
        return [eventValue.trim()];
      }

      if (!isRecord(eventValue)) {
        return [];
      }

      const id = readStringField(eventValue, 'id');

      return id === null ? [] : [id];
    })
  );
}

function readNestedStringArray(
  value: Record<string, unknown>,
  path: string
): readonly string[] {
  return readStringArray(readValueAtPath(value, path));
}

function readNestedStringField(
  value: Record<string, unknown>,
  path: string
): string | null {
  const candidate = readValueAtPath(value, path);

  return typeof candidate === 'string' && candidate.trim().length > 0
    ? candidate.trim()
    : null;
}

function readStringArray(value: unknown): readonly string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return unique(
    value.flatMap((entry) =>
      typeof entry === 'string' && entry.trim().length > 0 ? [entry.trim()] : []
    )
  );
}

function readStringField(value: Record<string, unknown>, field: string): string | null {
  const candidate = value[field];

  return typeof candidate === 'string' && candidate.trim().length > 0
    ? candidate.trim()
    : null;
}

function readValueAtPath(value: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((current, segment) => {
    if (!isRecord(current)) {
      return undefined;
    }

    return current[segment];
  }, value);
}

function formatServices(services: readonly ServicePackSummary[]): readonly string[] {
  if (services.length === 0) {
    return ['- 없음'];
  }

  return services.map(
    (service) =>
      `- ${service.id} (tier: ${formatNullable(service.tier)}, runtime: ${formatNullable(service.runtime)})`
  );
}

function formatList(values: readonly string[]): readonly string[] {
  return values.length === 0 ? ['- 없음'] : values.map((value) => `- ${value}`);
}

function formatInlineList(values: readonly string[]): string {
  return values.length === 0 ? '없음' : values.join(', ');
}

function formatNullable(value: string | null): string {
  return value ?? '미정';
}

function unique(values: readonly string[]): readonly string[] {
  return Array.from(new Set(values));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
