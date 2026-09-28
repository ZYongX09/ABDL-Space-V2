import { useCallback, useEffect, useRef, useState } from 'react';
import { normalizeFollowIds } from '../utils/followStatus.js';

export function useFollowStatuses(accountId, targetIds, fetchStatuses) {
  const accountKey = accountId == null ? '' : String(accountId);
  const idsKey = normalizeFollowIds(targetIds).join(',');
  const [state, setState] = useState({ accountKey: '', statuses: {} });
  const requestVersionRef = useRef(0);
  const localOverridesRef = useRef(new Map());

  useEffect(() => {
    const requestVersion = ++requestVersionRef.current;
    if (!accountKey || !idsKey) return undefined;

    const ids = idsKey.split(',').map(Number);
    let active = true;
    fetchStatuses(ids).then(statusMap => {
      if (!active || requestVersion !== requestVersionRef.current) return;
      setState(previous => {
        const nextStatuses = {};
        for (const id of ids) {
          const key = String(id);
          const overrideKey = `${accountKey}:${key}`;
          if (localOverridesRef.current.has(overrideKey)) {
            nextStatuses[key] = localOverridesRef.current.get(overrideKey);
          } else {
            nextStatuses[key] = !!statusMap[key].following;
          }
        }
        return { accountKey, statuses: nextStatuses };
      });
    }).catch(() => {
      // 状态查询失败不改写现有 UI；api 层不会再放大为逐用户请求。
    });

    return () => { active = false; };
  }, [accountKey, idsKey, fetchStatuses]);

  const setFollowing = useCallback((targetId, following) => {
    const key = String(targetId);
    localOverridesRef.current.set(`${accountKey}:${key}`, !!following);
    setState(previous => ({
      accountKey,
      statuses: {
        ...(previous.accountKey === accountKey ? previous.statuses : {}),
        [key]: !!following,
      },
    }));
  }, [accountKey]);

  return {
    followMap: state.accountKey === accountKey ? state.statuses : {},
    setFollowing,
  };
}
