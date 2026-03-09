/**
 * 兴国县兴莲乡实时车流量监控系统
 * Cloudflare Workers API 后端
 */

// 监测点配置
const MONITOR_POINTS = [
  { id: 1, name: '兴莲乡政府路口', lat: 26.3680, lng: 115.4180, road: 'X345 县道', base_flow: 50 },
  { id: 2, name: '兴莲中学门口', lat: 26.3665, lng: 115.4155, road: '中心街', base_flow: 40 },
  { id: 3, name: '兴莲卫生院路口', lat: 26.3690, lng: 115.4165, road: '健康路', base_flow: 35 },
  { id: 4, name: '兴莲农贸市场', lat: 26.3655, lng: 115.4190, road: '市场路', base_flow: 60 },
  { id: 5, name: '兴莲高速路口', lat: 26.3720, lng: 115.4100, road: '高速连接线', base_flow: 120 },
  { id: 6, name: '兴莲加油站', lat: 26.3640, lng: 115.4140, road: 'G356 国道', base_flow: 100 },
  { id: 7, name: '兴莲小学路口', lat: 26.3670, lng: 115.4200, road: '教育路', base_flow: 35 },
  { id: 8, name: '兴莲客运站', lat: 26.3650, lng: 115.4120, road: '交通路', base_flow: 80 },
];

/**
 * 计算时间因子（模拟早晚高峰）
 */
function getTimeFactor(now) {
  const hour = now.getUTCHours() + 8; // 转换为北京时间
  const weekday = now.getUTCDay();
  
  let baseFactor = 1.0;
  
  // 早晚高峰
  if (hour >= 7 && hour <= 9) {
    baseFactor = 1.5 + 0.5 * Math.sin((hour - 7) * Math.PI / 2);
  } else if (hour >= 17 && hour <= 19) {
    baseFactor = 1.8 + 0.5 * Math.sin((hour - 17) * Math.PI / 2);
  } else if (hour >= 11 && hour <= 13) {
    baseFactor = 1.2;
  } else if (hour >= 20 && hour <= 22) {
    baseFactor = 0.8;
  } else if (hour >= 0 && hour <= 6) {
    baseFactor = 0.3;
  }
  
  // 周末系数
  if (weekday === 0 || weekday === 6) {
    baseFactor *= 0.7;
  }
  
  // 集市日（农历 1、4、7）
  const dayOfMonth = now.getDate();
  if ([1, 4, 7].includes(dayOfMonth % 10)) {
    baseFactor *= 1.5;
  }
  
  return baseFactor;
}

/**
 * 计算拥堵指数
 */
function calculateCongestion(currentFlow, baseFlow) {
  const congestion = (currentFlow / baseFlow) * 3;
  return Math.min(10.0, Math.max(0.0, congestion));
}

/**
 * 根据拥堵指数估算车速
 */
function calculateSpeed(congestion) {
  if (congestion < 3) {
    return 40 + Math.random() * 20;
  } else if (congestion < 6) {
    return 25 + Math.random() * 15;
  } else {
    return 10 + Math.random() * 15;
  }
}

/**
 * 生成模拟数据
 */
function generateSimulatedData() {
  const now = new Date();
  const timeFactor = getTimeFactor(now);
  
  const monitorPoints = MONITOR_POINTS.map(point => {
    const randomFactor = 0.8 + Math.random() * 0.4; // 0.8-1.2
    const currentFlow = Math.floor(point.base_flow * timeFactor * randomFactor);
    const congestion = calculateCongestion(currentFlow, point.base_flow);
    const speed = calculateSpeed(congestion);
    
    return {
      id: point.id,
      name: point.name,
      road: point.road,
      lat: point.lat,
      lng: point.lng,
      flow: currentFlow,
      congestion: Math.round(congestion * 10) / 10,
      speed: Math.round(speed * 10) / 10,
      update_time: now.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
    };
  });
  
  const summary = {
    total_flow: monitorPoints.reduce((sum, p) => sum + p.flow, 0),
    avg_congestion: Math.round(monitorPoints.reduce((sum, p) => sum + p.congestion, 0) / monitorPoints.length * 10) / 10,
    avg_speed: Math.round(monitorPoints.reduce((sum, p) => sum + p.speed, 0) / monitorPoints.length * 10) / 10,
    peak_point: monitorPoints.reduce((max, p) => p.flow > max.flow ? p : max).name
  };
  
  return {
    status: 'success',
    mode: 'simulated',
    location: '兴国县兴莲乡',
    update_time: now.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }),
    monitor_points: monitorPoints,
    summary: summary
  };
}

/**
 * 调用高德 API 获取真实数据
 */
async function getGaodeData(env) {
  const apiKey = env.GAODE_API_KEY;
  
  if (!apiKey) {
    throw new Error('未配置高德 API Key，请在 Cloudflare Dashboard 设置环境变量 GAODE_API_KEY');
  }
  
  const now = new Date();
  const swLng = 115.40, swLat = 26.35;
  const neLng = 115.43, neLat = 26.38;
  
  const url = new URL('https://restapi.amap.com/v3/traffic/status/rectangle');
  url.searchParams.set('key', apiKey);
  url.searchParams.set('rectangle', `${swLng},${swLat},${neLng},${neLat}`);
  url.searchParams.set('policy', '2');
  url.searchParams.set('output', 'json');
  
  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: { 'Accept': 'application/json' }
  });
  
  if (!response.ok) {
    throw new Error(`高德 API 请求失败：${response.status}`);
  }
  
  const data = await response.json();
  
  if (data.status !== '1') {
    throw new Error(`高德 API 错误：${data.info || '未知错误'}`);
  }
  
  // 解析高德数据为标准格式
  const statuses = data.statuses || [];
  
  const monitorPoints = MONITOR_POINTS.map((point, index) => {
    const status = statuses[index % statuses.length] || {};
    const gaodeStatus = status.status || '1';
    const speed = parseFloat(status.speed) || 45;
    
    // 高德状态转拥堵指数
    const congestionMap = { '0': 2.0, '1': 1.5, '2': 5.0, '3': 8.0 };
    const congestion = congestionMap[gaodeStatus] || 2.0;
    
    // 车速转流量
    let flow;
    if (speed > 50) flow = Math.floor(point.base_flow * 0.8);
    else if (speed > 30) flow = point.base_flow;
    else if (speed > 15) flow = Math.floor(point.base_flow * 1.3);
    else flow = Math.floor(point.base_flow * 1.8);
    
    return {
      id: point.id,
      name: point.name,
      road: point.road,
      lat: point.lat,
      lng: point.lng,
      flow: flow,
      congestion: Math.round(congestion * 10) / 10,
      speed: Math.round(speed * 10) / 10,
      update_time: now.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
    };
  });
  
  const summary = {
    total_flow: monitorPoints.reduce((sum, p) => sum + p.flow, 0),
    avg_congestion: Math.round(monitorPoints.reduce((sum, p) => sum + p.congestion, 0) / monitorPoints.length * 10) / 10,
    avg_speed: Math.round(monitorPoints.reduce((sum, p) => sum + p.speed, 0) / monitorPoints.length * 10) / 10,
    peak_point: monitorPoints.reduce((max, p) => p.flow > max.flow ? p : max).name
  };
  
  return {
    status: 'success',
    mode: 'gaode',
    location: '兴国县兴莲乡',
    update_time: now.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }),
    monitor_points: monitorPoints,
    summary: summary
  };
}

/**
 * 生成历史数据
 */
function generateHistoryData() {
  const now = new Date();
  const history = [];
  
  for (let i = 23; i >= 0; i--) {
    const time = new Date(now.getTime() - i * 60 * 60 * 1000);
    const hour = time.getUTCHours() + 8;
    
    let flow;
    if (hour >= 7 && hour <= 9) flow = Math.floor(400 + Math.random() * 200);
    else if (hour >= 17 && hour <= 19) flow = Math.floor(500 + Math.random() * 200);
    else flow = Math.floor(200 + Math.random() * 200);
    
    history.push({
      time: `${hour.toString().padStart(2, '0')}:00`,
      flow: flow
    });
  }
  
  return {
    status: 'success',
    history: history
  };
}

/**
 * CORS 响应头
 */
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };
}

/**
 * 验证 API Key
 */
function validateApiKey(request, env) {
  const authHeader = request.headers.get('Authorization') || '';
  const apiKey = request.headers.get('X-API-Key') || 
                 new URL(request.url).searchParams.get('api_key') ||
                 authHeader.replace('Bearer ', '');
  
  if (!apiKey) {
    return { valid: false, error: '缺少 API Key，请在请求头中添加 X-API-Key 或 ?api_key=xxx' };
  }
  
  // 验证 API Key（支持多个，逗号分隔）
  const validKeys = (env.API_KEYS || '').split(',').map(k => k.trim()).filter(k => k);
  
  if (!validKeys.includes(apiKey)) {
    return { valid: false, error: '无效的 API Key' };
  }
  
  return { valid: true, apiKey };
}

/**
 * 速率限制检查
 */
async function checkRateLimit(request, env, apiKey) {
  const now = Math.floor(Date.now() / 1000);
  const minuteKey = `ratelimit:${apiKey}:${Math.floor(now / 60)}`;
  const hourKey = `ratelimit:${apiKey}:${Math.floor(now / 3600)}`;
  const dayKey = `ratelimit:${apiKey}:${Math.floor(now / 86400)}`;
  
  // 限制配置
  const LIMITS = {
    per_minute: parseInt(env.LIMIT_PER_MINUTE) || 10,
    per_hour: parseInt(env.LIMIT_PER_HOUR) || 100,
    per_day: parseInt(env.LIMIT_PER_DAY) || 1000
  };
  
  // 检查限流（使用 KV 存储或内存计数）
  if (env.TRAFFIC_KV) {
    const [minuteCount, hourCount, dayCount] = await Promise.all([
      env.TRAFFIC_KV.get(minuteKey, { type: 'json' }),
      env.TRAFFIC_KV.get(hourKey, { type: 'json' }),
      env.TRAFFIC_KV.get(dayKey, { type: 'json' })
    ]);
    
    if (minuteCount && minuteCount.count >= LIMITS.per_minute) {
      return { 
        allowed: false, 
        error: '速率限制：每分钟最多 10 次请求',
        retry_after: 60 - (now % 60)
      };
    }
    if (hourCount && hourCount.count >= LIMITS.per_hour) {
      return { 
        allowed: false, 
        error: '速率限制：每小时最多 100 次请求',
        retry_after: 3600 - (now % 3600)
      };
    }
    if (dayCount && dayCount.count >= LIMITS.per_day) {
      return { 
        allowed: false, 
        error: '速率限制：每天最多 1000 次请求',
        retry_after: 86400 - (now % 86400)
      };
    }
    
    // 增加计数
    await Promise.all([
      env.TRAFFIC_KV.put(minuteKey, JSON.stringify({ count: (minuteCount?.count || 0) + 1 }), { expirationTtl: 120 }),
      env.TRAFFIC_KV.put(hourKey, JSON.stringify({ count: (hourCount?.count || 0) + 1 }), { expirationTtl: 7200 }),
      env.TRAFFIC_KV.put(dayKey, JSON.stringify({ count: (dayCount?.count || 0) + 1 }), { expirationTtl: 172800 })
    ]);
  }
  
  return { 
    allowed: true,
    limits: LIMITS
  };
}

/**
 * 记录 API 调用日志
 */
async function logApiUsage(env, apiKey, endpoint, responseTime) {
  if (!env.TRAFFIC_KV || !env.LOG_USAGE) return;
  
  const now = new Date();
  const dateKey = `usage:${apiKey}:${now.toISOString().split('T')[0]}`;
  
  try {
    const usage = await env.TRAFFIC_KV.get(dateKey, { type: 'json' }) || { calls: [], total: 0 };
    usage.calls.push({
      endpoint,
      timestamp: now.toISOString(),
      response_time: responseTime
    });
    usage.total += 1;
    await env.TRAFFIC_KV.put(dateKey, JSON.stringify(usage), { expirationTtl: 2592000 }); // 30 天
  } catch (e) {
    console.error('记录日志失败:', e);
  }
}

/**
 * Workers 主入口
 */
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const startTime = Date.now();
    
    // CORS 预检请求
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }
    
    // 公开端点（不需要 API Key）
    const publicEndpoints = ['/', '/index.html', '/dashboard.html'];
    if (publicEndpoints.includes(path)) {
      // 由 Pages 处理静态文件
      return new Response('Not Found', { status: 404 });
    }
    
    // API 端点需要验证
    if (path.startsWith('/api/')) {
      // 1. 验证 API Key
      const authResult = validateApiKey(request, env);
      if (!authResult.valid) {
        return new Response(JSON.stringify({
          status: 'error',
          error_code: 'UNAUTHORIZED',
          error_message: authResult.error
        }), {
          status: 401,
          headers: corsHeaders()
        });
      }
      
      // 2. 检查速率限制
      const rateLimitResult = await checkRateLimit(request, env, authResult.apiKey);
      if (!rateLimitResult.allowed) {
        return new Response(JSON.stringify({
          status: 'error',
          error_code: 'RATE_LIMITED',
          error_message: rateLimitResult.error,
          retry_after: rateLimitResult.retry_after
        }), {
          status: 429,
          headers: {
            ...corsHeaders(),
            'Retry-After': rateLimitResult.retry_after.toString()
          }
        });
      }
      
      try {
        // 3. 处理 API 请求
        let data;
        
        if (path === '/api/traffic') {
          const mode = url.searchParams.get('mode') || env.MODE || 'simulated';
          
          if (mode === 'gaode') {
            data = await getGaodeData(env);
          } else {
            data = generateSimulatedData();
          }
          
          // 记录日志
          await logApiUsage(env, authResult.apiKey, '/api/traffic', Date.now() - startTime);
          
          return new Response(JSON.stringify(data), {
            headers: {
              ...corsHeaders(),
              'X-RateLimit-Limit': rateLimitResult.limits?.per_minute || 10,
              'X-RateLimit-Remaining': (rateLimitResult.limits?.per_minute || 10) - 1
            }
          });
        }
        
        if (path === '/api/history') {
          data = generateHistoryData();
          await logApiUsage(env, authResult.apiKey, '/api/history', Date.now() - startTime);
          
          return new Response(JSON.stringify(data), {
            headers: corsHeaders()
          });
        }
        
        if (path === '/api/config') {
          const config = {
            mode: env.MODE || 'simulated',
            has_api_key: !!env.GAODE_API_KEY,
            location: '兴国县兴莲乡',
            refresh_interval: 30,
            rate_limits: {
              per_minute: env.LIMIT_PER_MINUTE || 10,
              per_hour: env.LIMIT_PER_HOUR || 100,
              per_day: env.LIMIT_PER_DAY || 1000
            }
          };
          return new Response(JSON.stringify(config), {
            headers: corsHeaders()
          });
        }
        
        if (path === '/api/usage') {
          // 查询用量统计
          if (!env.TRAFFIC_KV) {
            return new Response(JSON.stringify({
              status: 'error',
              error_message: '未启用用量统计'
            }), { status: 503 });
          }
          
          const now = new Date();
          const dateKey = `usage:${authResult.apiKey}:${now.toISOString().split('T')[0]}`;
          const usage = await env.TRAFFIC_KV.get(dateKey, { type: 'json' });
          
          return new Response(JSON.stringify({
            status: 'success',
            date: now.toISOString().split('T')[0],
            total_calls: usage?.total || 0,
            calls: usage?.calls || []
          }), {
            headers: corsHeaders()
          });
        }
        
      } catch (error) {
        await logApiUsage(env, authResult.apiKey, path, Date.now() - startTime);
        
        return new Response(JSON.stringify({
          status: 'error',
          error_code: 'INTERNAL_ERROR',
          error_message: error.message
        }), {
          status: 500,
          headers: corsHeaders()
        });
      }
    }
    
    // 默认返回 404
    return new Response('Not Found', { status: 404 });
  }
};
