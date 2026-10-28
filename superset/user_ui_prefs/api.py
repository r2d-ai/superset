# Licensed to the Apache Software Foundation (ASF) under one
# or more contributor license agreements.  See the NOTICE file
# distributed with this work for additional information
# regarding copyright ownership.  The ASF licenses this file
# to you under the Apache License, Version 2.0 (the
# "License"); you may not use this file except in compliance
# with the License.  You may obtain a copy of the License at
#
#   http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing,
# software distributed under the License is distributed on an
# "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
# KIND, either express or implied.  See the License for the
# specific language governing permissions and limitations
# under the License.
from __future__ import annotations

import logging
from functools import wraps
from typing import Any, Callable

from flask import g, jsonify, request, Response
from flask_appbuilder.api import expose, safe
from marshmallow import ValidationError

from superset.daos.user_ui_prefs import UserUiPrefDAO
from superset.extensions import event_logger
from superset.user_ui_prefs.schemas import UserUiPrefPutSchema
from superset.user_ui_prefs.validators import validate_ui_pref_key
from superset.utils.decorators import transaction
from superset.views.base_api import BaseSupersetApi, requires_json, statsd_metrics

logger = logging.getLogger(__name__)


def require_authenticated(f: Callable[..., Response]) -> Callable[..., Response]:
    """
    Require a logged-in user and return 401 JSON when there is none.

    This API is self-scoped: every query and write is keyed on ``g.user.id``,
    so access must not depend on a FAB role permission (``can_read`` /
    ``can_write`` on the view). Those permissions are only attached to roles by
    ``superset init``, and only for the roles listed there -- which made a
    freshly deployed instance answer 403 for every account. Authentication is
    the only requirement here; authorization is "your own row, nothing else".
    """

    @wraps(f)
    def wrapper(self: Any, *args: Any, **kwargs: Any) -> Response:
        user = g.user if hasattr(g, "user") else None
        if not user or getattr(user, "is_anonymous", True):
            return self.response_401()
        return f(self, *args, **kwargs)

    return wrapper


class UserUiPrefsRestApi(BaseSupersetApi):
    """REST API for per-user UI preferences (scoped to the authenticated user)."""

    allow_browser_login = True
    resource_name = "user_ui_prefs"
    openapi_spec_tag = "User UI Preferences"
    put_schema = UserUiPrefPutSchema()

    def response(self, status_code: int, **kwargs: Any) -> Response:
        resp = jsonify(kwargs)
        resp.status_code = status_code
        resp.cache_control.no_store = True
        return resp

    def _require_user_id(self) -> int | Response:
        user = g.user if hasattr(g, "user") else None
        if not user or user.is_anonymous:
            return self.response_401()
        return user.id

    def _validate_key(self, key: str) -> Response | None:
        message = validate_ui_pref_key(key)
        if message:
            return self.response(400, message=message)
        return None

    @expose("/<key>", methods=("GET",))
    @require_authenticated
    @safe
    @statsd_metrics
    @event_logger.log_this_with_context(
        action=lambda self, *args, **kwargs: f"{self.__class__.__name__}.get",
        log_to_statsd=True,
    )
    def get_pref(self, key: str) -> Response:
        """Get a UI preference for the current user."""
        user_id = self._require_user_id()
        if not isinstance(user_id, int):
            return user_id
        if error := self._validate_key(key):
            return error
        row = UserUiPrefDAO.get_for_user(user_id, key)
        return self.response(200, key=key, value=row.value if row else None)

    @expose("/<key>", methods=("PUT",))
    @require_authenticated
    @safe
    @requires_json
    @statsd_metrics
    @event_logger.log_this_with_context(
        action=lambda self, *args, **kwargs: f"{self.__class__.__name__}.put",
        log_to_statsd=True,
    )
    @transaction()
    def put_pref(self, key: str) -> Response:
        """Create or update a UI preference for the current user."""
        user_id = self._require_user_id()
        if not isinstance(user_id, int):
            return user_id
        if error := self._validate_key(key):
            return error
        try:
            payload = self.put_schema.load(request.json or {})
        except ValidationError as ex:
            return self.response(400, message=ex.messages)
        row = UserUiPrefDAO.upsert_for_user(user_id, key, payload["value"])
        return self.response(200, key=key, value=row.value)
