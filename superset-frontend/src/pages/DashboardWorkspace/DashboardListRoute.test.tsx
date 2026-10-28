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
import { render, screen } from 'spec/helpers/testing-library';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import { QueryParamProvider } from 'use-query-params';
import { ReactRouter5Adapter } from 'use-query-params/adapters/react-router-5';
import { RoutePaths } from 'src/views/routePaths';
import type { UserWithPermissionsAndRoles } from 'src/types/bootstrapTypes';
import getBootstrapData from 'src/utils/getBootstrapData';
import DashboardListRoute, {
  isDashboardWorkspaceEnabled,
} from './DashboardListRoute';
import {
  mockAdminUser,
  setupMocks,
} from 'src/pages/DashboardList/DashboardList.testHelpers';

jest.mock('src/utils/getBootstrapData', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    common: {
      conf: { DASHBOARD_WORKSPACE_ENABLED: true },
      feature_flags: {},
    },
  })),
}));

jest.mock('src/pages/DashboardList', () => ({
  __esModule: true,
  default: () => <div data-test="mock-classic-dashboard-list">Classic list</div>,
}));

jest.mock('./index', () => ({
  __esModule: true,
  default: () => <div data-test="dashboard-workspace">Workspace</div>,
}));

const mockUser = mockAdminUser as unknown as UserWithPermissionsAndRoles;
const listPath: string = RoutePaths.DASHBOARD_LIST;

function renderRoute(initialPath: string = listPath) {
  const store = configureStore({
    reducer: {
      user: () => mockUser,
      messageToasts: () => [],
    },
  });
  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[initialPath] as [string, ...string[]]}>
        <QueryParamProvider adapter={ReactRouter5Adapter}>
          <DashboardListRoute user={mockUser} />
        </QueryParamProvider>
      </MemoryRouter>
    </Provider>,
  );
}

beforeAll(() => {
  setupMocks();
});

beforeEach(() => {
  (getBootstrapData as jest.Mock).mockReturnValue({
    common: { conf: { DASHBOARD_WORKSPACE_ENABLED: true } },
  });
});

test('isDashboardWorkspaceEnabled is true when flag missing', () => {
  (getBootstrapData as jest.Mock).mockReturnValue({ common: { conf: {} } });
  expect(isDashboardWorkspaceEnabled()).toBe(true);
});

test('isDashboardWorkspaceEnabled is false only when explicitly false', () => {
  (getBootstrapData as jest.Mock).mockReturnValue({
    common: { conf: { DASHBOARD_WORKSPACE_ENABLED: false } },
  });
  expect(isDashboardWorkspaceEnabled()).toBe(false);
});

test('renders workspace when enabled', async () => {
  renderRoute(listPath);
  expect(await screen.findByTestId('dashboard-workspace')).toBeInTheDocument();
});

test('renders classic list when kill switch is false', async () => {
  (getBootstrapData as jest.Mock).mockReturnValue({
    common: { conf: { DASHBOARD_WORKSPACE_ENABLED: false } },
  });
  renderRoute(listPath);
  expect(
    await screen.findByTestId('mock-classic-dashboard-list'),
  ).toBeInTheDocument();
});

test('?view=table renders classic list when workspace enabled', async () => {
  renderRoute(`${listPath}?view=table`);
  expect(
    await screen.findByTestId('mock-classic-dashboard-list'),
  ).toBeInTheDocument();
});

test('?view=table renders classic list when kill switch is false', async () => {
  (getBootstrapData as jest.Mock).mockReturnValue({
    common: { conf: { DASHBOARD_WORKSPACE_ENABLED: false } },
  });
  renderRoute(`${listPath}?view=table`);
  expect(
    await screen.findByTestId('mock-classic-dashboard-list'),
  ).toBeInTheDocument();
});
