/**
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */
import { t } from '@apache-superset/core/translation';
import { styled } from '@apache-superset/core/theme';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { StringParam, useQueryParam } from 'use-query-params';
import { debounce } from 'lodash-es';
import { Input, Loading } from '@superset-ui/core/components';
import { ListViewFilterOperator } from 'src/components';
import { useListViewResource, useFavoriteStatus } from 'src/views/CRUD/hooks';
import withToasts from 'src/components/MessageToasts/withToasts';
import DashboardCard from 'src/features/dashboards/DashboardCard';
import type { UserWithPermissionsAndRoles } from 'src/types/bootstrapTypes';
import SubMenu from 'src/features/home/SubMenu';
import { DashboardWorkspacePane } from './DashboardWorkspacePane';
import {
  DASHBOARD_WORKSPACE_LIST_COLUMNS,
  DASHBOARD_WORKSPACE_PAGE_SIZE,
  getDashboardWorkspaceDefaultSlug,
} from './constants';
import {
  dashboardIdOrSlug,
  dashboardMatchesIdOrSlug,
  type WorkspaceDashboard,
} from './utils';

const Shell = styled.div`
  display: flex;
  flex: 1;
  min-height: 0;
  min-width: 0;
`;

const Sidebar = styled.aside`
  width: 360px;
  max-width: 40%;
  flex-shrink: 0;
  border-right: 1px solid ${({ theme }) => theme.colorBorderSecondary};
  overflow-y: auto;
  padding: ${({ theme }) => theme.sizeUnit * 3}px;
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.sizeUnit * 2}px;
`;

const CardGrid = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.sizeUnit * 2}px;
`;

const Preview = styled.main`
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
`;

interface DashboardWorkspaceProps {
  addDangerToast: (msg: string) => void;
  user?: UserWithPermissionsAndRoles;
}

function resolvePaneId(
  dashboards: WorkspaceDashboard[],
  queryId: string | null | undefined,
): string | undefined {
  const trimmed = queryId?.trim();
  if (trimmed) {
    const match = dashboards.find(d => dashboardMatchesIdOrSlug(d, trimmed));
    if (match) {
      return dashboardIdOrSlug(match);
    }
    // Deep-link to a dashboard not on the current list page (search / first 100).
    return trimmed;
  }
  const defaultSlug = getDashboardWorkspaceDefaultSlug();
  if (defaultSlug) {
    const match = dashboards.find(d =>
      dashboardMatchesIdOrSlug(d, defaultSlug),
    );
    if (match) {
      return dashboardIdOrSlug(match);
    }
  }
  if (dashboards[0]) {
    return dashboardIdOrSlug(dashboards[0]);
  }
  return undefined;
}

function DashboardWorkspace({ addDangerToast, user }: DashboardWorkspaceProps) {
  const [queryId, setQueryId] = useQueryParam('id', StringParam);
  const [searchText, setSearchText] = useState('');

  const {
    state: { loading, resourceCollection: dashboards, resourceCount },
    hasPerm,
    fetchData,
  } = useListViewResource<WorkspaceDashboard>(
    'dashboard',
    t('dashboard'),
    addDangerToast,
    undefined,
    undefined,
    undefined,
    undefined,
    DASHBOARD_WORKSPACE_LIST_COLUMNS,
  );

  const fetchDashboards = useCallback(
    (search: string) => {
      const filters = search.trim()
        ? [
            {
              id: 'dashboard_title',
              operator: ListViewFilterOperator.Contains,
              value: search.trim(),
            },
          ]
        : [];
      fetchData({
        pageIndex: 0,
        pageSize: DASHBOARD_WORKSPACE_PAGE_SIZE,
        sortBy: [{ id: 'changed_on_delta_humanized', desc: true }],
        filters,
      });
    },
    [fetchData],
  );

  const debouncedFetch = useMemo(
    () => debounce((value: string) => fetchDashboards(value), 300),
    [fetchDashboards],
  );

  useEffect(() => {
    if (!searchText.trim()) {
      fetchDashboards('');
      return undefined;
    }
    debouncedFetch(searchText);
    return () => {
      debouncedFetch.cancel();
    };
  }, [searchText, fetchDashboards, debouncedFetch]);

  const filteredDashboards = useMemo(() => {
    const needle = searchText.trim().toLowerCase();
    if (!needle) {
      return dashboards;
    }
    return dashboards.filter(d => {
      const title = d.dashboard_title?.toLowerCase() ?? '';
      const slug = d.slug?.toLowerCase() ?? '';
      return title.includes(needle) || slug.includes(needle);
    });
  }, [dashboards, searchText]);

  const dashboardIds = useMemo(
    () => filteredDashboards.map(d => d.id),
    [filteredDashboards],
  );
  const [saveFavoriteStatus, favoriteStatus] = useFavoriteStatus(
    'dashboard',
    dashboardIds,
    addDangerToast,
  );

  const activeIdOrSlug = useMemo(
    () => resolvePaneId(dashboards, queryId),
    [dashboards, queryId],
  );

  useEffect(() => {
    if (loading) {
      return;
    }
    if (queryId?.trim()) {
      return;
    }
    const defaultId = resolvePaneId(dashboards, undefined);
    if (defaultId) {
      setQueryId(defaultId, 'replaceIn');
    }
  }, [loading, dashboards, queryId, setQueryId]);

  const onSelectDashboard = useCallback(
    (dashboard: WorkspaceDashboard) => {
      setQueryId(dashboardIdOrSlug(dashboard), 'push');
    },
    [setQueryId],
  );

  const noopExport = useCallback(() => {}, []);
  const noopDelete = useCallback(() => {}, []);

  const listTruncated =
    !searchText.trim() &&
    typeof resourceCount === 'number' &&
    resourceCount > dashboards.length;

  return (
    <>
      <SubMenu name={t('Dashboards')} />
      <Shell data-test="dashboard-workspace">
        <Sidebar data-test="dashboard-workspace-sidebar">
          <Input
            allowClear
            placeholder={t('Search dashboards')}
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            data-test="dashboard-workspace-search"
          />
          {listTruncated && (
            <div data-test="dashboard-workspace-truncation-hint">
              {t(
                'Showing the first %(count)s dashboards. Search by title to find others.',
                { count: dashboards.length },
              )}
            </div>
          )}
          {loading ? (
            <Loading />
          ) : filteredDashboards.length === 0 ? (
            <div>{t('No dashboards found')}</div>
          ) : (
            <CardGrid>
              {filteredDashboards.map(dashboard => {
                const idOrSlug = dashboardIdOrSlug(dashboard);
                return (
                  <DashboardCard
                    key={dashboard.id}
                    dashboard={dashboard}
                    hasPerm={hasPerm}
                    bulkSelectEnabled={false}
                    loading={false}
                    saveFavoriteStatus={saveFavoriteStatus}
                    favoriteStatus={favoriteStatus[dashboard.id]}
                    user={user}
                    showThumbnails
                    handleBulkDashboardExport={noopExport}
                    onDelete={noopDelete}
                    onSelect={onSelectDashboard}
                    isActive={activeIdOrSlug === idOrSlug}
                    workspaceMode
                  />
                );
              })}
            </CardGrid>
          )}
        </Sidebar>
        <Preview data-test="dashboard-workspace-preview">
          {activeIdOrSlug ? (
            <DashboardWorkspacePane idOrSlug={activeIdOrSlug} />
          ) : (
            <Loading />
          )}
        </Preview>
      </Shell>
    </>
  );
}

export default withToasts(DashboardWorkspace);
