/**
 * API 数据层 v2 — 对接 B 站点后端 (ZhX589/abdl-space)
 * Base URL: 生产 https://api.abdl.space / 本地 http://localhost:8787
 * 双模式：VITE_API_BASE 为空时走 localStorage 离线模式
 */
const API_BASE = import.meta.env.VITE_API_BASE || '';
const USE_API = !!API_BASE;

// 评分维度权重
const DIM_WEIGHTS = {
  absorption_score: 0.30,
  comfort_score: 0.35,
  thickness_score: 0.10,
  appearance_score: 0.20,
  value_score: 0.05,
};
const DIM_KEYS = Object.keys(DIM_WEIGHTS);

/** 加权评分（本地离线模式用） */
function weightedScore(rating) {
  return DIM_KEYS.reduce((sum, dim) => sum + (rating[dim] || 0) * DIM_WEIGHTS[dim], 0);
}

// ====== 通用 fetch ======
async function apiFetch(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers, credentials: 'include' });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`服务器响应异常 (${res.status})`);
  }
  if (!res.ok) throw new Error(data.error || `请求失败 (${res.status})`);
  return data;
}

// ====== 内存缓存层 ======
const _cache = new Map();
const CACHE_TTL = {
  short: 30 * 1000,      // 30秒 — 帖子列表、评论
  medium: 2 * 60 * 1000,  // 2分钟 — 帖子详情、用户信息
  long: 5 * 60 * 1000,    // 5分钟 — 纸尿裤、排行榜、静态数据
};

function cacheGet(key) {
  const entry = _cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expireAt) { _cache.delete(key); return null; }
  return entry.data;
}

function cacheSet(key, data, ttl = CACHE_TTL.short) {
  // 缓存大小限制：超过 100 条时驱逐最早的
  if (_cache.size > 100) {
    const firstKey = _cache.keys().next().value;
    if (firstKey) _cache.delete(firstKey);
  }
  _cache.set(key, { data, expireAt: Date.now() + ttl });
}

function cacheInvalidate(pattern) {
  for (const key of _cache.keys()) {
    if (key.includes(pattern)) _cache.delete(key);
  }
}

// 带缓存的 fetch：先返回缓存，后台刷新
async function cachedFetch(key, fetchFn, ttl = CACHE_TTL.short) {
  const cached = cacheGet(key);
  if (cached) {
    // 后台静默刷新（stale-while-revalidate）
    fetchFn().then(data => cacheSet(key, data, ttl)).catch(e => { console.warn('[cache] refresh failed:', key, e); });
    return cached;
  }
  const data = await fetchFn();
  cacheSet(key, data, ttl);
  return data;
}

// ====== localStorage 工具 ======
const LS = {
  get(key) { try { return JSON.parse(localStorage.getItem('abdl_' + key)); } catch { return null; } },
  set(key, val) { localStorage.setItem('abdl_' + key, JSON.stringify(val)); },
  del(key) { localStorage.removeItem('abdl_' + key); },
};

// ====== 静态数据 ======
let _diapers = null, _terms = null;

async function hashPasswordOffline(password) {
  const data = new TextEncoder().encode(password);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function loadJSON(path) {
  const res = await fetch(path);
  return res.json();
}

export async function loadData() {
  const [d, t] = await Promise.all([loadJSON('/data/diapers.json'), loadJSON('/data/terms.json')]);
  _diapers = d; _terms = t;
  return { diapers: d, terms: t };
}

// =====================================================================
// 认证 Auth
// =====================================================================
export const authAPI = {
  register: async ({ username, password, email, code, captchaToken }) => {
    const headers = {};
    if (captchaToken) headers['X-Captcha-Token'] = captchaToken;
    return apiFetch('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, username, code }),
      headers,
    });
  },

  sendCode: async ({ email, type, captchaToken }) => {
    const headers = {};
    if (captchaToken) headers['X-Captcha-Token'] = captchaToken;
    return apiFetch('/api/auth/send-code', {
      method: 'POST',
      body: JSON.stringify({ email, type }),
      headers,
    });
  },

  resetPassword: async ({ email, code, newPassword }) => {
    return apiFetch('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ email, code, newPassword }),
    });
  },

  bindEmail: async ({ email, code }) => {
    return apiFetch('/api/auth/bind-email', {
      method: 'POST',
      body: JSON.stringify({ email, code }),
    });
  },

  login: async ({ login, password, captchaToken }) => {
    if (USE_API) {
      const headers = {};
      if (captchaToken) headers['X-Captcha-Token'] = captchaToken;
      return apiFetch('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ login, password }),
        headers,
      });
    }
    const users = LS.get('users') || {};
    const user = Object.values(users).find(u => u.username === login || u.email === login) || users[login];
    const hash = await hashPasswordOffline(password);
    if (!user || user.passwordHash !== hash) throw new Error('用户名或密码错误');
    LS.set('currentUser', user);
    return { token: 'local-' + user.id, user: { ...user, password: undefined } };
  },

  me: async () => {
    if (USE_API) {
      const user = await apiFetch('/api/auth/me');
      return { user };
    }
    const user = LS.get('currentUser');
    if (!user) throw new Error('未登录');
    return { user: { ...user, password: undefined } };
  },

  updateProfile: async (body) => {
    if (USE_API) {
      const data = await apiFetch('/api/users/me', { method: 'PATCH', body: JSON.stringify(body) });
      return data;
    }
    const user = LS.get('currentUser');
    if (!user) throw new Error('未登录');
    Object.assign(user, body);
    const users = LS.get('users') || {};
    users[user.username] = user;
    LS.set('users', users);
    LS.set('currentUser', user);
    return { user: { ...user, password: undefined } };
  },

  getUser: async (id) => {
    if (USE_API) {
      const data = await apiFetch(`/api/users/${id}`);
      return data;
    }
    const users = LS.get('users') || {};
    const u = Object.values(users).find(uu => uu.id === Number(id));
    if (!u) throw new Error('用户不存在');
    return { user: { ...u, password: undefined } };
  },

  deleteAccount: async () => {
    if (USE_API) {
      await apiFetch('/api/auth/account', { method: 'DELETE' });
      fetch(`${API_BASE}/api/auth/logout`, { method: 'POST', credentials: 'include' }).catch(() => {});
      return { message: '已删除' };
    }
    const user = LS.get('currentUser');
    if (user) { const users = LS.get('users') || {}; delete users[user.username]; LS.set('users', users); }
    LS.del('currentUser');
    return { message: '已删除' };
  },
};

// =====================================================================
// 纸尿裤 Diapers
// =====================================================================
export const diapersAPI = {
  list: async (params = {}) => {
    if (USE_API) {
      const qs = new URLSearchParams();
      if (params.search) qs.set('search', params.search);
      if (params.brand) qs.set('brand', params.brand);
      if (params.size) qs.set('size', params.size);
      if (params.sort) qs.set('sort', params.sort);
      if (params.order) qs.set('order', params.order);
      if (params.page) qs.set('page', params.page);
      if (params.limit) qs.set('limit', params.limit);
      const cacheKey = `diapers:${qs}`;
      if (params.search) return apiFetch(`/api/diapers?${qs}`);
      return cachedFetch(cacheKey, () => apiFetch(`/api/diapers?${qs}`), CACHE_TTL.long);
    }
    if (!_diapers) await loadData();
    let list = [..._diapers];
    if (params.search) { const s = params.search.toLowerCase(); list = list.filter(d => d.brand.toLowerCase().includes(s) || d.model.toLowerCase().includes(s)); }
    if (params.brand) list = list.filter(d => d.brand === params.brand);
    if (params.size) list = list.filter(d => d.sizes?.some(s => s.label === params.size));
    // 附加评分
    const ratings = LS.get('ratings') || {};
    const dims = DIM_KEYS;
    list = list.map(d => {
      const r = Object.values(ratings).filter(rr => rr.diaper_id === d.id);
      const avgScore = r.length > 0 ? r.reduce((s, ri) => s + weightedScore(ri), 0) / r.length : 0;
      return { ...d, avg_score: Math.round(avgScore * 10) / 10, rating_count: r.length };
    });
    // 排序
    const sort = params.sort || 'id';
    const order = params.order || 'ASC';
    const sortFns = {
      avg_score: (a, b) => (a.avg_score || 0) - (b.avg_score || 0),
      rating_count: (a, b) => (a.rating_count || 0) - (b.rating_count || 0),
      thickness: (a, b) => (a.thickness || 0) - (b.thickness || 0),
      id: (a, b) => a.id - b.id,
    };
    const sortFn = sortFns[sort] || sortFns.id;
    list.sort((a, b) => order === 'DESC' ? sortFn(b, a) : sortFn(a, b));
    const page = Number(params.page) || 1, limit = Number(params.limit) || 20;
    const total = list.length;
    list = list.slice((page - 1) * limit, page * limit);
    return { diapers: list, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  },

  get: async (id) => {
    if (USE_API) return cachedFetch(`diaper:${id}`, () => apiFetch(`/api/diapers/${id}`), CACHE_TTL.long);
    if (!_diapers) await loadData();
    const d = _diapers.find(dd => dd.id === Number(id));
    if (!d) throw new Error('纸尿裤不存在');
    const ratings = LS.get('ratings') || {};
    const r = Object.values(ratings).filter(rr => rr.diaper_id === d.id).map(rr => {
      const users = LS.get('users') || {};
      const u = Object.values(users).find(uu => uu.id === rr.user_id);
      return { ...rr, user: { id: u?.id, username: u?.username, avatar: u?.avatar } };
    });
    return { diaper: d, reviews: r, wiki: null };
  },

  brands: async () => {
    if (USE_API) return apiFetch('/api/diapers/brands');
    if (!_diapers) await loadData();
    return { brands: [...new Set(_diapers.map(d => d.brand))] };
  },

  sizes: async () => {
    if (USE_API) return apiFetch('/api/diapers/sizes');
    if (!_diapers) await loadData();
    return { sizes: [...new Set(_diapers.flatMap(d => d.sizes?.map(s => s.label) || []))] };
  },

  compare: async (ids) => {
    if (USE_API) return apiFetch(`/api/diapers/compare?ids=${ids.join(',')}`);
    if (!_diapers) await loadData();
    const ratings = LS.get('ratings') || {};
    const dims = DIM_KEYS;
    const diapers = ids.map(id => {
      const d = _diapers.find(dd => dd.id === Number(id));
      if (!d) return null;
      const r = Object.values(ratings).filter(rr => rr.diaper_id === d.id);
      const dimensions = {};
      for (const dim of dims) {
        const scores = r.map(rr => rr[dim]).filter(v => v != null);
        dimensions[dim] = { avg: scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length * 10) / 10 : 0 };
      }
      const avgScore = r.length > 0 ? r.reduce((s, ri) => s + weightedScore(ri), 0) / r.length : 0;
      return { ...d, dimensions, avg_score: Math.round(avgScore * 10) / 10, rating_count: r.length };
    }).filter(Boolean);
    return { diapers };
  },
};

// =====================================================================
// 评分 Ratings
// =====================================================================
export const ratingsAPI = {
  create: async ({ diaper_id, review, ...scores }) => {
    if (USE_API) {
      return apiFetch('/api/ratings', {
        method: 'POST',
        body: JSON.stringify({ diaper_id, review: review || undefined, ...scores }),
      });
    }
    const user = LS.get('currentUser');
    if (!user) throw new Error('请先登录');
    const ratings = LS.get('ratings') || {};
    const key = `${user.id}-${diaper_id}`;
    if (ratings[key]) throw new Error('已经评过分了');
    ratings[key] = { id: Date.now(), user_id: user.id, diaper_id, ...scores, review: review || null, review_status: 'approved', created_at: new Date().toISOString() };
    LS.set('ratings', ratings);
    return { message: '评分成功', review_status: 'approved', id: ratings[key].id };
  },

  getForDiaper: async (id) => {
    if (USE_API) return apiFetch(`/api/diapers/${id}/ratings`);
    const ratings = LS.get('ratings') || {};
    const reviews = Object.values(ratings).filter(r => r.diaper_id === Number(id));
    return { reviews, stats: { composite: 0, count: reviews.length, dimensions: {} } };
  },

  getMine: async (diaperId) => {
    if (USE_API) return apiFetch(`/api/ratings/me/${diaperId}`);
    const user = LS.get('currentUser');
    if (!user) return { rating: null };
    const ratings = LS.get('ratings') || {};
    return { rating: ratings[`${user.id}-${diaperId}`] || null };
  },

  delete: async (id) => {
    if (USE_API) return apiFetch(`/api/ratings/${id}`, { method: 'DELETE' });
    const ratings = LS.get('ratings') || {};
    const key = Object.keys(ratings).find(k => ratings[k].id === id);
    if (key) { delete ratings[key]; LS.set('ratings', ratings); }
    return { message: '删除成功' };
  },
};

// =====================================================================
// 使用感受 Feelings
// =====================================================================
export const feelingsAPI = {
  create: async ({ diaper_id, size, ...dims }) => {
    if (USE_API) {
      return apiFetch('/api/feelings', {
        method: 'POST',
        body: JSON.stringify({ diaper_id, size, ...dims }),
      });
    }
    const user = LS.get('currentUser');
    if (!user) throw new Error('请先登录');
    const feelings = LS.get('feelings') || {};
    const key = `${user.id}-${diaper_id}-${size}`;
    if (feelings[key]) throw new Error('已经提交过该尺码的感受');
    feelings[key] = { id: Date.now(), user_id: user.id, diaper_id, size, ...dims, created_at: new Date().toISOString() };
    LS.set('feelings', feelings);
    return { message: '提交成功', id: feelings[key].id };
  },

  getForDiaper: async (id) => {
    if (USE_API) return apiFetch(`/api/diapers/${id}/feelings`);
    const feelings = LS.get('feelings') || {};
    const list = Object.values(feelings).filter(f => f.diaper_id === Number(id));
    return { feelings: list, stats: {}, count: list.length };
  },

  getMine: async (diaperId, size) => {
    if (USE_API) return apiFetch(`/api/feelings/me/${diaperId}/${size}`);
    const user = LS.get('currentUser');
    if (!user) return { feeling: null };
    const feelings = LS.get('feelings') || {};
    return { feeling: feelings[`${user.id}-${diaperId}-${size}`] || null };
  },

  delete: async (id) => {
    if (USE_API) return apiFetch(`/api/feelings/${id}`, { method: 'DELETE' });
    const feelings = LS.get('feelings') || {};
    const key = Object.keys(feelings).find(k => feelings[k].id === id);
    if (key) { delete feelings[key]; LS.set('feelings', feelings); }
    return { message: '删除成功' };
  },
};

// =====================================================================
// 排行榜 Rankings
// =====================================================================
export const rankingsAPI = {
  get: async (type = 'hot', dimension) => {
    if (USE_API) {
      const qs = new URLSearchParams({ type });
      if (dimension) qs.set('dimension', dimension);
      return cachedFetch(`rankings:${qs}`, () => apiFetch(`/api/rankings?${qs}`), CACHE_TTL.long);
    }
    if (!_diapers) await loadData();
    const ratings = LS.get('ratings') || {};
    const dims = DIM_KEYS;
    const scored = _diapers.map(d => {
      const r = Object.values(ratings).filter(rr => rr.diaper_id === d.id);
      const avgScore = r.length > 0 ? r.reduce((s, ri) => s + weightedScore(ri), 0) / r.length : 0;
      return { ...d, avg_score: Math.round(avgScore * 10) / 10, rating_count: r.length };
    });
    if (type === 'absorbency') {
      const extract = t => { if (!t) return 0; const m = t.match(/(\d+)\s*ml/gi); return m ? Math.max(...m.map(x => parseInt(x))) : 0; };
      scored.sort((a, b) => (extract(b.absorbency_adult) || extract(b.absorbency_mfr) || 0) - (extract(a.absorbency_adult) || extract(a.absorbency_mfr) || 0));
    } else if (type === 'popular') {
      scored.sort((a, b) => b.rating_count - a.rating_count);
    } else if (type === 'dimension' && dimension) {
      scored.sort((a, b) => {
        const aScores = Object.values(ratings).filter(rr => rr.diaper_id === a.id).map(rr => rr[dimension]).filter(Boolean);
        const bScores = Object.values(ratings).filter(rr => rr.diaper_id === b.id).map(rr => rr[dimension]).filter(Boolean);
        const aAvg = aScores.length > 0 ? aScores.reduce((s, v) => s + v, 0) / aScores.length : 0;
        const bAvg = bScores.length > 0 ? bScores.reduce((s, v) => s + v, 0) / bScores.length : 0;
        return bAvg - aAvg;
      });
    } else {
      scored.sort((a, b) => b.avg_score - a.avg_score);
    }
    return { rankings: scored.slice(0, 20), type };
  },
};

// =====================================================================
// 广场 Posts（后端路径 /api/posts）
// =====================================================================
export const forumAPI = {
  feed: async ({ page = 1, limit = 20, search, excludeNsfw } = {}) => {
    if (USE_API) {
      const qs = new URLSearchParams({ page, limit });
      if (search) qs.set('search', search);
      if (excludeNsfw) qs.set('exclude_nsfw', '1');
      const cacheKey = `feed:${qs}`;
      // 搜索不缓存
      if (search) return apiFetch(`/api/posts?${qs}`);
      return cachedFetch(cacheKey, () => apiFetch(`/api/posts?${qs}`), CACHE_TTL.short);
    }
    let posts = LS.get('posts') || [];
    if (search) { const s = search.toLowerCase(); posts = posts.filter(p => p.content?.toLowerCase().includes(s)); }
    posts.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    const users = LS.get('users') || {};
    const likes = LS.get('likes') || {};
    const comments = LS.get('comments') || {};
    const currentUser = LS.get('currentUser');
    const enriched = posts.slice((page - 1) * limit, page * limit).map(p => {
      const u = Object.values(users).find(uu => uu.id === p.user_id);
      const likeCount = Object.values(likes).filter(l => l.target_type === 'post' && l.target_id === p.id).length;
      const commentCount = Object.values(comments).filter(c => c.post_id === p.id).length;
      const hasLiked = currentUser ? Object.values(likes).some(l => l.user_id === currentUser.id && l.target_type === 'post' && l.target_id === p.id) : false;
      return { ...p, user: { id: u?.id, username: u?.username, avatar: u?.avatar, role: u?.role }, like_count: likeCount, has_liked: hasLiked, comment_count: commentCount };
    });
    return { posts: enriched, pagination: { page, limit, total: posts.length, totalPages: Math.ceil(posts.length / limit) } };
  },

  getPost: async (id) => {
    if (USE_API) return cachedFetch(`post:${id}`, () => apiFetch(`/api/posts/${id}`), CACHE_TTL.medium);
    const posts = LS.get('posts') || [];
    const post = posts.find(p => p.id === Number(id));
    if (!post) throw new Error('帖子不存在');
    const users = LS.get('users') || {};
    const u = Object.values(users).find(uu => uu.id === post.user_id);
    const likes = LS.get('likes') || {};
    const currentUser = LS.get('currentUser');
    const likeCount = Object.values(likes).filter(l => l.target_type === 'post' && l.target_id === post.id).length;
    const hasLiked = currentUser ? Object.values(likes).some(l => l.user_id === currentUser.id && l.target_type === 'post' && l.target_id === post.id) : false;
    const comments = LS.get('comments') || {};
    const postComments = Object.values(comments).filter(c => c.post_id === post.id).map(c => {
      const cu = Object.values(users).find(uu => uu.id === c.user_id);
      return { ...c, user: { id: cu?.id, username: cu?.username, avatar: cu?.avatar, role: cu?.role } };
    });
    return {
      post: { ...post, user: { id: u?.id, username: u?.username, avatar: u?.avatar, role: u?.role }, like_count: likeCount, has_liked: hasLiked, comment_count: postComments.length },
      comments: postComments,
    };
  },

  create: async ({ content, diaper_id, images }) => {
    if (USE_API) {
      const result = await apiFetch('/api/posts', { method: 'POST', body: JSON.stringify({ content, diaper_id, images }) });
      cacheInvalidate('feed:');
      return result;
    }
    const user = LS.get('currentUser');
    if (!user) throw new Error('请先登录');
    const posts = LS.get('posts') || [];
    const post = { id: Date.now(), user_id: user.id, content, diaper_id: diaper_id || null, pinned: false, created_at: new Date().toISOString() };
    posts.unshift(post);
    LS.set('posts', posts);
    return { id: post.id, message: '发布成功' };
  },

  delete: async (id) => {
    if (USE_API) {
      // 先获取帖子图片，删除图床图片
      try {
        const postData = await apiFetch(`/api/posts/${id}`);
        const images = postData.post?.images || [];
        for (const img of images) {
          if (img.image_url) {
            try { await imagesAPI.delete(img.image_url); } catch {}
          }
        }
      } catch {}
      const result = await apiFetch(`/api/posts/${id}`, { method: 'DELETE' });
      cacheInvalidate('feed:');
      cacheInvalidate(`post:${id}`);
      return result;
    }
    let posts = LS.get('posts') || [];
    posts = posts.filter(p => p.id !== Number(id));
    LS.set('posts', posts);
    return { message: '已删除' };
  },

  editPost: async (id, { content }) => {
    if (USE_API) {
      const result = await apiFetch(`/api/posts/${id}`, { method: 'PATCH', body: JSON.stringify({ content }) });
      cacheInvalidate('feed:');
      cacheInvalidate(`post:${id}`);
      return result;
    }
    const posts = LS.get('posts') || [];
    const post = posts.find(p => p.id === Number(id));
    if (!post) throw new Error('帖子不存在');
    post.content = content;
    LS.set('posts', posts);
    return { message: '已修改' };
  },

  comment: async (postId, { content, parent_id, images, captchaToken }) => {
    if (USE_API) {
      const headers = {};
      if (captchaToken) headers['X-Captcha-Token'] = captchaToken;
      const result = await apiFetch(`/api/posts/${postId}/comments`, { method: 'POST', body: JSON.stringify({ content, parent_id, images }), headers });
      cacheInvalidate(`post:${postId}`);
      return result;
    }
    const user = LS.get('currentUser');
    if (!user) throw new Error('请先登录');
    const comments = LS.get('comments') || {};
    const c = { id: Date.now(), post_id: Number(postId), user_id: user.id, parent_id: parent_id || null, content, created_at: new Date().toISOString() };
    comments[c.id] = c;
    LS.set('comments', comments);
    return { message: '评论成功', id: c.id };
  },

  // 点赞（后端 POST /api/likes，toggle）
  like: async ({ target_type, target_id }) => {
    if (USE_API) return apiFetch('/api/likes', { method: 'POST', body: JSON.stringify({ target_type, target_id }) });
    const user = LS.get('currentUser');
    if (!user) throw new Error('请先登录');
    const likes = LS.get('likes') || {};
    const key = `${user.id}-${target_type}-${target_id}`;
    if (likes[key]) { delete likes[key]; LS.set('likes', likes); return { liked: false }; }
    likes[key] = { user_id: user.id, target_type, target_id };
    LS.set('likes', likes);
    return { liked: true };
  },
};

// =====================================================================
// 术语 Terms（后端路径 /api/terms）
// =====================================================================
export const termWikiAPI = {
  list: async (params = {}) => {
    if (USE_API) {
      const qs = new URLSearchParams();
      if (params.search) qs.set('search', params.search);
      if (params.category) qs.set('category', params.category);
      return apiFetch(`/api/terms?${qs}`);
    }
    if (!_terms) await loadData();
    let list = [..._terms];
    if (params.search) { const s = params.search.toLowerCase(); list = list.filter(t => t.term.toLowerCase().includes(s) || t.definition.toLowerCase().includes(s)); }
    if (params.category) list = list.filter(t => t.category === params.category);
    return { terms: list };
  },

  categories: async () => {
    if (USE_API) return apiFetch('/api/terms/categories');
    if (!_terms) await loadData();
    return { categories: [...new Set(_terms.map(t => t.category).filter(Boolean))] };
  },
};

// =====================================================================
// 推荐 Recommend（后端 POST /api/recommend + GET /api/recommend/guess）
// =====================================================================
export const recommendAPI = {
  // AI 推荐（走后端，后端内部调用 DeepSeek）
  getRecommend: async (selected = {}) => {
    if (USE_API) {
      return apiFetch('/api/recommend', {
        method: 'POST',
        body: JSON.stringify({ selected: { basic: true, body: true, prefs: true, bio: true, feelings: true, ...selected } }),
      });
    }
    // 离线模式：返回空
    return { recommendations: [], summary: '离线模式下无法使用 AI 推荐' };
  },

  // 猜你喜欢（纯数据，无需 AI）
  guess: async () => {
    if (USE_API) return apiFetch('/api/recommend/guess');
    if (!_diapers) await loadData();
    const ratings = LS.get('ratings') || {};
    const dims = DIM_KEYS;
    const scored = _diapers.map(d => {
      const r = Object.values(ratings).filter(rr => rr.diaper_id === d.id);
      const avgScore = r.length > 0 ? r.reduce((s, ri) => s + weightedScore(ri), 0) / r.length : 0;
      return { ...d, avg_score: Math.round(avgScore * 10) / 10, rating_count: r.length };
    }).sort((a, b) => b.avg_score - a.avg_score).slice(0, 5);
    return {
      recommendations: scored.map(d => ({
        ...d,
        reason: d.avg_score >= 8 ? '综合评分超高，社区力荐' : d.thickness <= 2 ? '超薄设计，适合日常穿着' : '热门之选',
      })),
    };
  },
};

export const wikiAPI = {
  list: async (params = {}) => {
    if (USE_API) {
      const qs = new URLSearchParams();
      if (params.diaper_id) qs.set('diaper_id', params.diaper_id);
      if (params.page) qs.set('page', params.page);
      if (params.limit) qs.set('limit', params.limit);
      return apiFetch(`/api/pages?${qs}`);
    }
    return { pages: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } };
  },

  get: async (slug) => {
    if (USE_API) return apiFetch(`/api/pages/${slug}`);
    return null;
  },

  create: async ({ slug, title, content, diaper_id }) => {
    if (USE_API) return apiFetch('/api/pages', { method: 'POST', body: JSON.stringify({ slug, title, content, diaper_id }) });
    throw new Error('离线模式不支持创建 Wiki');
  },

  update: async (slug, body) => {
    if (USE_API) return apiFetch(`/api/pages/${slug}`, { method: 'PUT', body: JSON.stringify(body) });
    throw new Error('离线模式不支持编辑 Wiki');
  },

  delete: async (slug) => {
    if (USE_API) return apiFetch(`/api/pages/${slug}`, { method: 'DELETE' });
    throw new Error('离线模式不支持删除 Wiki');
  },

  // 段评
  getInlineComments: async (slug, paragraph_hash) => {
    if (USE_API) {
      const qs = paragraph_hash ? `?paragraph_hash=${paragraph_hash}` : '';
      return apiFetch(`/api/pages/${slug}/inline-comments${qs}`);
    }
    return { comments: [] };
  },

  createInlineComment: async (slug, { paragraph_hash, content }) => {
    if (USE_API) return apiFetch(`/api/pages/${slug}/inline-comments`, { method: 'POST', body: JSON.stringify({ paragraph_hash, content }) });
    throw new Error('离线模式不支持段评');
  },

  deleteInlineComment: async (slug, id) => {
    if (USE_API) return apiFetch(`/api/pages/${slug}/inline-comments/${id}`, { method: 'DELETE' });
    throw new Error('离线模式不支持删除段评');
  },
};

// =====================================================================
// 消息 Messages（后端暂未实现，localStorage 兜底）
// =====================================================================
export const messagesAPI = {
  // 获取会话列表
  conversations: async () => {
    if (USE_API) return apiFetch('/api/messages/conversations');
    const conversations = LS.get('conversations') || [];
    return { conversations };
  },

  // 获取与某用户的消息
  getMessages: async (userId) => {
    if (USE_API) return apiFetch(`/api/messages/${userId}`);
    const msgs = LS.get('messages') || {};
    const key = Object.keys(msgs).find(k => k.includes(String(userId)));
    const allMsgs = key ? msgs[key] : [];
    // 也兼容旧格式 (key = userId)
    const legacyMsgs = msgs[userId] || [];
    const merged = [...new Map([...allMsgs, ...legacyMsgs].map(m => [m.id, m])).values()]
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    return { messages: merged };
  },

  // 发送消息
  send: async (receiverId, content) => {
    if (USE_API) return apiFetch('/api/messages', { method: 'POST', body: JSON.stringify({ receiver_id: receiverId, content }) });
    const user = LS.get('currentUser');
    if (!user) throw new Error('请先登录');
    const msgs = LS.get('messages') || {};
    const key = [user.id, receiverId].sort().join('-');
    if (!msgs[key]) msgs[key] = [];
    const msg = { id: Date.now(), sender_id: user.id, receiver_id: receiverId, content, created_at: new Date().toISOString(), read: false };
    msgs[key].push(msg);
    LS.set('messages', msgs);
    // 更新会话列表
    const convos = LS.get('conversations') || [];
    const existing = convos.find(c => c.user_id === receiverId);
    if (existing) {
      existing.last_message = content;
      existing.last_message_at = msg.created_at;
      existing.unread = 0;
    } else {
      convos.unshift({ user_id: receiverId, last_message: content, last_message_at: msg.created_at, unread: 0 });
    }
    LS.set('conversations', convos);
    return { message: '发送成功', id: msg.id };
  },

  // 标记已读
  markRead: async (userId) => {
    if (USE_API) return apiFetch(`/api/messages/${userId}/read`, { method: 'POST' });
    const convos = LS.get('conversations') || [];
    const convo = convos.find(c => c.user_id === userId);
    if (convo) convo.unread = 0;
    LS.set('conversations', convos);
    return { message: '已标为已读' };
  },

  // 检查是否可以发消息
  canMessage: async (userId) => {
    if (USE_API) return apiFetch(`/api/users/${userId}/can-message`);
    return { allowed: true };
  },

  // 兼容旧接口
  withUser: (userId) => {
    const msgs = LS.get('messages') || {};
    const users = LS.get('users') || {};
    const u = Object.values(users).find(uu => uu.id === userId);
    return { messages: msgs[userId] || [], other: { id: userId, username: u?.username || '用户' } };
  },
};

// =====================================================================
// 通知 Notifications（后端 /api/notifications）
// =====================================================================
export const imagesAPI = {
  // 删除图床图片（后端代理，API Key 不暴露）
  delete: async (url) => {
    if (USE_API) return apiFetch('/api/images/delete', { method: 'POST', body: JSON.stringify({ url }) });
    return { message: '已删除' };
  },

  // 列出图床图片（管理员）
  list: async (page = 1, perPage = 20) => {
    if (USE_API) return apiFetch(`/api/images/list?page=${page}&perPage=${perPage}`);
    return { files: [], total: 0 };
  },
};

export const notificationsAPI = {
  list: async () => {
    if (USE_API) return apiFetch('/api/notifications');
    return { notifications: [], unread_count: 0 };
  },

  readAll: async () => {
    if (USE_API) return apiFetch('/api/notifications/read-all', { method: 'POST' });
    return { message: '已全部标为已读' };
  },
};

// =====================================================================
// 举报 Reports（后端 /api/reports）
// =====================================================================
export const reportsAPI = {
  submit: async ({ target_type, target_id, reason, description }) => {
    if (USE_API) return apiFetch('/api/reports', { method: 'POST', body: JSON.stringify({ target_type, target_id, reason, description }) });
    return { message: '举报已提交' };
  },
};

// =====================================================================
// 用户等级 & 历史（后端 /api/users/:id/level 等）
// =====================================================================
export const usersAPI = {
  getLevel: async (id) => {
    if (USE_API) return apiFetch(`/api/users/${id}/level`);
    return { level: { level: 1, exp: 0, total_exp: 0, badge_name: '婴儿奶瓶', badge_icon: 'fa-baby', next_level: 2, next_exp_required: 100, progress: 0 } };
  },

  getPosts: async (id, params = {}) => {
    if (USE_API) {
      const qs = new URLSearchParams();
      if (params.page) qs.set('page', params.page);
      if (params.limit) qs.set('limit', params.limit);
      return apiFetch(`/api/users/${id}/posts?${qs}`);
    }
    const posts = LS.get('posts') || [];
    return { posts: posts.filter(p => p.user_id === Number(id)) };
  },

  getRatings: async (id) => {
    if (USE_API) return apiFetch(`/api/users/${id}/ratings`);
    const ratings = LS.get('ratings') || {};
    return { reviews: Object.values(ratings).filter(r => r.user_id === Number(id)) };
  },

  getFeelings: async (id) => {
    if (USE_API) return apiFetch(`/api/users/${id}/feelings`);
    const feelings = LS.get('feelings') || {};
    return { feelings: Object.values(feelings).filter(f => f.user_id === Number(id)) };
  },

  getWorn: async (id) => {
    if (USE_API) return apiFetch(`/api/users/${id}/worn`);
    return { worn: [], total: 0 };
  },
};

// =====================================================================
// 管理 Admin（后端 /api/admin/*）
// =====================================================================
export const adminAPI = {
  stats: async () => {
    if (USE_API) return apiFetch('/api/admin/stats');
    return { users: Object.keys(LS.get('users') || {}).length, posts: (LS.get('posts') || []).length, diapers: _diapers?.length || 0, comments: 0, ratings: 0 };
  },

  users: async () => {
    if (USE_API) return apiFetch('/api/admin/users');
    const users = LS.get('users') || {};
    return { users: Object.values(users).map(u => ({ ...u, password: undefined })) };
  },

  deleteUser: async (id) => {
    if (USE_API) return apiFetch(`/api/admin/users/${id}`, { method: 'DELETE' });
    return { message: '已删除' };
  },

  banUser: async (id) => {
    if (USE_API) return apiFetch(`/api/admin/users/${id}/ban`, { method: 'POST' });
    return { banned: true };
  },

  pinPost: async (id) => {
    if (USE_API) return apiFetch(`/api/admin/posts/${id}/pin`, { method: 'POST' });
    return { pinned: true };
  },

  deletePost: async (id) => {
    if (USE_API) return apiFetch(`/api/admin/posts/${id}`, { method: 'DELETE' });
    let posts = LS.get('posts') || [];
    posts = posts.filter(p => p.id !== id);
    LS.set('posts', posts);
    return { message: '已删除' };
  },

  deleteComment: async (id) => {
    if (USE_API) return apiFetch(`/api/admin/comments/${id}`, { method: 'DELETE' });
    return { message: '已删除' };
  },

  deleteDiaper: async (id) => {
    if (USE_API) return apiFetch(`/api/admin/diapers/${id}`, { method: 'DELETE' });
    return { message: '已删除' };
  },

  listDiapers: async () => {
    if (USE_API) return apiFetch('/api/admin/diapers');
    return { diapers: _diapers || [] };
  },

  createDiaper: async (data) => {
    if (USE_API) return apiFetch('/api/admin/diapers', { method: 'POST', body: JSON.stringify(data) });
    return { id: Date.now(), message: '创建成功' };
  },

  updateDiaper: async (id, data) => {
    if (USE_API) return apiFetch(`/api/admin/diapers/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
    return { message: '更新成功' };
  },

  // 品牌管理
  listBrands: async () => {
    if (USE_API) return apiFetch('/api/admin/brands');
    return { brands: [] };
  },
  saveBrand: async (data) => {
    if (USE_API) return apiFetch('/api/admin/brands', { method: 'POST', body: JSON.stringify(data) });
    return { message: '成功' };
  },
  deleteBrand: async (id) => {
    if (USE_API) return apiFetch(`/api/admin/brands/${id}`, { method: 'DELETE' });
    return { message: '删除成功' };
  },

  posts: async () => {
    if (USE_API) return apiFetch('/api/admin/posts');
    return { posts: LS.get('posts') || [] };
  },

  comments: async () => {
    if (USE_API) return apiFetch('/api/admin/comments');
    return { comments: [] };
  },

  diapers: async () => {
    if (USE_API) return apiFetch('/api/admin/diapers');
    return { diapers: [] };
  },

  promoteUser: async (id) => {
    if (USE_API) return apiFetch('/api/admin/add', { method: 'POST', body: JSON.stringify({ user_ids: [id] }) });
    return { message: '已提升' };
  },

  // 举报管理
  reports: async (status = 'pending', page = 1) => {
    if (USE_API) return apiFetch(`/api/reports/admin?status=${status}&page=${page}`);
    return { reports: [], pagination: { page: 1, total: 0 } };
  },

  resolveReport: async (id, action, deleteContent = false) => {
    if (USE_API) return apiFetch(`/api/reports/admin/${id}`, { method: 'PATCH', body: JSON.stringify({ action, delete_content: deleteContent }) });
    return { message: '已处理' };
  },
};

// =====================================================================
// 关注 Follows（后端 /api/follows）
// =====================================================================
export const followsAPI = {
  follow: async (userId) => {
    if (USE_API) return apiFetch(`/api/follows/${userId}`, { method: 'POST' });
    return { message: '已关注', mutual: false };
  },

  unfollow: async (userId) => {
    if (USE_API) return apiFetch(`/api/follows/${userId}`, { method: 'DELETE' });
    return { message: '已取消关注' };
  },

  status: async (userId) => {
    if (USE_API) return apiFetch(`/api/follows/${userId}/status`);
    return { following: false, follower: false, mutual: false };
  },

  followers: async (userId, page = 1) => {
    if (USE_API) return apiFetch(`/api/follows/${userId}/followers?page=${page}`);
    return { users: [], total: 0 };
  },

  following: async (userId, page = 1) => {
    if (USE_API) return apiFetch(`/api/follows/${userId}/following?page=${page}`);
    return { users: [], total: 0 };
  },
};

// =====================================================================
// Captcha 验证码（后端 /api/captcha）
// =====================================================================
export const captchaAPI = {
  /**
   * 创建验证挑战
   * @param {string} type - 验证类型，默认 'quantum'
   * @returns {{ session_id, type, challenge, ttl }}
   */
  createChallenge: async (type = 'quantum') => {
    if (!USE_API) {
      // 离线模式: 返回空，前端走本地验证
      return { session_id: null, type, challenge: null, ttl: 300 };
    }
    return apiFetch('/api/captcha/challenge', {
      method: 'POST',
      body: JSON.stringify({ type }),
    });
  },

  /**
   * 提交验证答案
   * @param {string} sessionId
   * @param {string} answer - 逗号分隔的节点顺序
   * @returns {{ success, token?, attempts_left?, locked?, lock_seconds? }}
   */
  verify: async (sessionId, answer) => {
    if (!USE_API) {
      // 离线模式: 始终返回成功
      return { success: true, token: 'offline' };
    }
    return apiFetch('/api/captcha/verify', {
      method: 'POST',
      body: JSON.stringify({ session_id: sessionId, answer }),
    });
  },

  /** 健康检查 */
  status: async () => {
    return apiFetch('/api/captcha/status');
  },
};
