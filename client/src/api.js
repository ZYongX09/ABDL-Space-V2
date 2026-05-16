/**
 * API 数据层 v2 — 对接 B 站点后端 (ZhX589/abdl-space)
 * Base URL: 生产 https://api.abdl.space / 本地 http://localhost:8787
 * 双模式：VITE_API_BASE 为空时走 localStorage 离线模式
 */
const API_BASE = import.meta.env.VITE_API_BASE || '';
const USE_API = !!API_BASE;

// ====== 通用 fetch ======
function getToken() { return localStorage.getItem('token'); }

async function apiFetch(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `请求失败 (${res.status})`);
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
  register: async ({ username, password, email }) => {
    if (USE_API) {
      return apiFetch('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email: email || `${username}@abdl.local`, password, username }),
      });
    }
    const users = LS.get('users') || {};
    if (users[username]) throw new Error('用户名已被使用');
    const passwordHash = await hashPasswordOffline(password);
    const user = {
      id: Date.now(), username, passwordHash, email: email || `${username}@abdl.local`,
      role: 'user',
      avatar: null, age: null, region: null, weight: null, waist: null, hip: null,
      style_preference: null, bio: null, created_at: new Date().toISOString(),
    };
    users[username] = user;
    LS.set('users', users);
    LS.set('currentUser', user);
    return { token: 'local-' + user.id, user: { ...user, password: undefined } };
  },

  login: async ({ login, password }) => {
    if (USE_API) {
      return apiFetch('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ login, password }),
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
      localStorage.removeItem('token');
      return { message: '已删除' };
    }
    const user = LS.get('currentUser');
    if (user) { const users = LS.get('users') || {}; delete users[user.username]; LS.set('users', users); }
    LS.del('currentUser');
    localStorage.removeItem('token');
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
      return apiFetch(`/api/diapers?${qs}`);
    }
    if (!_diapers) await loadData();
    let list = [..._diapers];
    if (params.search) { const s = params.search.toLowerCase(); list = list.filter(d => d.brand.toLowerCase().includes(s) || d.model.toLowerCase().includes(s)); }
    if (params.brand) list = list.filter(d => d.brand === params.brand);
    if (params.size) list = list.filter(d => d.sizes?.some(s => s.label === params.size));
    // 附加评分
    const ratings = LS.get('ratings') || {};
    const dims = ['absorption_score','fit_score','comfort_score','thickness_score','appearance_score','value_score'];
    list = list.map(d => {
      const r = Object.values(ratings).filter(rr => rr.diaper_id === d.id);
      const avgScore = r.length > 0 ? r.reduce((s, ri) => s + dims.reduce((a, dim) => a + (ri[dim]||0), 0) / dims.length, 0) / r.length : 0;
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
    if (USE_API) return apiFetch(`/api/diapers/${id}`);
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
    const dims = ['absorption_score','fit_score','comfort_score','thickness_score','appearance_score','value_score'];
    const diapers = ids.map(id => {
      const d = _diapers.find(dd => dd.id === Number(id));
      if (!d) return null;
      const r = Object.values(ratings).filter(rr => rr.diaper_id === d.id);
      const dimensions = {};
      for (const dim of dims) {
        const scores = r.map(rr => rr[dim]).filter(v => v != null);
        dimensions[dim] = { avg: scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length * 10) / 10 : 0 };
      }
      const avgScore = r.length > 0 ? r.reduce((s, ri) => s + dims.reduce((a, dim) => a + (ri[dim]||0), 0) / dims.length, 0) / r.length : 0;
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
      return apiFetch(`/api/rankings?${qs}`);
    }
    if (!_diapers) await loadData();
    const ratings = LS.get('ratings') || {};
    const dims = ['absorption_score','fit_score','comfort_score','thickness_score','appearance_score','value_score'];
    const scored = _diapers.map(d => {
      const r = Object.values(ratings).filter(rr => rr.diaper_id === d.id);
      const avgScore = r.length > 0 ? r.reduce((s, ri) => s + dims.reduce((a, dim) => a + (ri[dim]||0), 0) / dims.length, 0) / r.length : 0;
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
// 论坛 Posts（后端路径 /api/posts）
// =====================================================================
export const forumAPI = {
  feed: async ({ page = 1, limit = 20, search } = {}) => {
    if (USE_API) {
      const qs = new URLSearchParams({ page, limit });
      if (search) qs.set('search', search);
      return apiFetch(`/api/posts?${qs}`);
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
    if (USE_API) return apiFetch(`/api/posts/${id}`);
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
    if (USE_API) return apiFetch('/api/posts', { method: 'POST', body: JSON.stringify({ content, diaper_id, images }) });
    const user = LS.get('currentUser');
    if (!user) throw new Error('请先登录');
    const posts = LS.get('posts') || [];
    const post = { id: Date.now(), user_id: user.id, content, diaper_id: diaper_id || null, pinned: false, created_at: new Date().toISOString() };
    posts.unshift(post);
    LS.set('posts', posts);
    return { id: post.id, message: '发布成功' };
  },

  delete: async (id) => {
    if (USE_API) return apiFetch(`/api/posts/${id}`, { method: 'DELETE' });
    let posts = LS.get('posts') || [];
    posts = posts.filter(p => p.id !== Number(id));
    LS.set('posts', posts);
    return { message: '已删除' };
  },

  comment: async (postId, { content, parent_id, images }) => {
    if (USE_API) return apiFetch(`/api/posts/${postId}/comments`, { method: 'POST', body: JSON.stringify({ content, parent_id, images }) });
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
    const dims = ['absorption_score','fit_score','comfort_score','thickness_score','appearance_score','value_score'];
    const scored = _diapers.map(d => {
      const r = Object.values(ratings).filter(rr => rr.diaper_id === d.id);
      const avgScore = r.length > 0 ? r.reduce((s, ri) => s + dims.reduce((a, dim) => a + (ri[dim]||0), 0) / dims.length, 0) / r.length : 0;
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
  conversations: () => ({ conversations: LS.get('conversations') || [] }),
  withUser: (userId) => {
    const msgs = LS.get('messages') || {};
    const users = LS.get('users') || {};
    const u = Object.values(users).find(uu => uu.id === userId);
    return { messages: msgs[userId] || [], other: { id: userId, username: u?.username || '用户' } };
  },
  send: ({ receiver_id, content }) => {
    const user = LS.get('currentUser');
    if (!user) throw new Error('请先登录');
    const msgs = LS.get('messages') || {};
    if (!msgs[receiver_id]) msgs[receiver_id] = [];
    msgs[receiver_id].push({ id: Date.now(), sender_id: user.id, content, created_at: new Date().toISOString() });
    LS.set('messages', msgs);
    return { message: '发送成功' };
  },
};

// =====================================================================
// 通知 Notifications（后端 /api/notifications）
// =====================================================================
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
};
