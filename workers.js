// 配置
const config = {
  // 目标网站
  target: 'https://archiveofourown.org',
  
  // 需要移除的请求头
  headersToRemove: [
    'cf-connecting-ip',
    'cf-ray',
    'cf-ipcountry',
    'x-forwarded-for',
    'x-real-ip'
  ],
  
  // 需要修改的响应头
  modifyResponseHeaders: {
    'access-control-allow-origin': '*',
    'cache-control': 'public, max-age=3600'
  }
}

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

async function handleRequest(request) {
  // 处理OPTIONS预检请求
  if (request.method === 'OPTIONS') {
    return handleCORS(request)
  }
  
  const url = new URL(request.url)
  const targetUrl = new URL(config.target)
  
  // 构建最终URL
  targetUrl.pathname = url.pathname
  targetUrl.search = url.search
  
  // 准备请求头
  const headers = new Headers(request.headers)
  
  // 设置正确的Host头
  headers.set('Host', targetUrl.hostname)
  
  // 移除不需要的请求头
  config.headersToRemove.forEach(header => {
    headers.delete(header)
  })
  
  // 添加自定义请求头（可选）
  headers.set('X-Forwarded-Host', url.hostname)
  
  try {
    // 发送请求到目标网站
    const response = await fetch(targetUrl.toString(), {
      method: request.method,
      headers: headers,
      body: request.body,
      redirect: 'follow'
    })
    
    // 处理响应
    return modifyResponse(response, url)
    
  } catch (error) {
    console.error('Proxy error:', error)
    return new Response(JSON.stringify({
      error: 'Proxy error',
      message: error.message
    }), {
      status: 502,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    })
  }
}

// 处理CORS预检请求
function handleCORS(request) {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Max-Age': '86400'
    }
  })
}

// 修改响应
function modifyResponse(response, originalUrl) {
  const newHeaders = new Headers(response.headers)
  
  // 应用自定义响应头
  Object.entries(config.modifyResponseHeaders).forEach(([key, value]) => {
    newHeaders.set(key, value)
  })
  
  // 处理cookies
  const cookies = newHeaders.get('set-cookie')
  if (cookies) {
    // 修改cookie的domain和secure属性
    let modifiedCookies = cookies
      .replace(/Domain=[^;]+;/g, `Domain=${originalUrl.hostname};`)
      .replace(/Secure;/g, '') // 如果worker使用http，可能需要移除Secure
    
    newHeaders.set('set-cookie', modifiedCookies)
  }
  
  // 移除不需要的响应头
  newHeaders.delete('strict-transport-security')
  
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders
  })
}      // 保留查询参数
      actualUrlStr += url.search;

      // 创建新 Headers 对象，排除以 'cf-' 开头的请求头
      const newHeaders = filterHeaders(request.headers, name => !name.startsWith('cf-'));

      // 创建一个新的请求以访问目标 URL
      const modifiedRequest = new Request(actualUrlStr, {
          headers: newHeaders,
          method: request.method,
          body: request.body,
          redirect: 'manual'
      });

      // 发起对目标 URL 的请求
      const response = await fetch(modifiedRequest);
      let body = response.body;

      // 处理重定向
      if ([301, 302, 303, 307, 308].includes(response.status)) {
          body = response.body;
          // 创建新的 Response 对象以修改 Location 头部
          return handleRedirect(response, body);
      } else if (response.headers.get("Content-Type")?.includes("text/html")) {
          body = await handleHtmlContent(response, url.protocol, url.host, actualUrlStr);
      }

      // 创建修改后的响应对象
      const modifiedResponse = new Response(body, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers
      });

      // 添加禁用缓存的头部
      setNoCacheHeaders(modifiedResponse.headers);

      // 添加 CORS 头部，允许跨域访问
      setCorsHeaders(modifiedResponse.headers);

      return modifiedResponse;
  } catch (error) {
      console.error('Error:', error);
      return new Response('Internal Server Error', {
          status: 500,
          statusText: 'Internal Server Error',
          headers: {
              'Content-Type': 'text/plain; charset=utf-8'
          }
      });
  }
}

// 确保 URL 带有协议
function ensureProtocol(url, defaultProtocol) {
  return url.startsWith("http://") || url.startsWith("https://") ? url : defaultProtocol + "//" + url;
}

// 处理重定向
function handleRedirect(response, body) {
  const location = new URL(response.headers.get('location'));
  const modifiedLocation = `/${encodeURIComponent(location.toString())}`;
  return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers: {
          ...response.headers,
          'Location': modifiedLocation
      }
  });
}

// 处理 HTML 内容中的相对路径
async function handleHtmlContent(response, protocol, host, actualUrlStr) {
  const originalText = await response.text();
  const regex = new RegExp('((href|src|action)=["\'])/(?!/)', 'g');
  let modifiedText = replaceRelativePaths(originalText, protocol, host, new URL(actualUrlStr).origin);

  return modifiedText;
}

// 替换 HTML 内容中的相对路径
function replaceRelativePaths(text, protocol, host, origin) {
  const regex = new RegExp('((href|src|action)=["\'])/(?!/)', 'g');
  return text.replace(regex, `$1${protocol}//${host}/${origin}/`);
}

// 返回 JSON 格式的响应
function jsonResponse(data, status) {
  return new Response(JSON.stringify(data), {
      status: status,
      headers: {
          'Content-Type': 'application/json; charset=utf-8'
      }
  });
}

// 过滤请求头
function filterHeaders(headers, filterFunc) {
  return new Headers([...headers].filter(([name]) => filterFunc(name)));
}

// 设置禁用缓存的头部
function setNoCacheHeaders(headers) {
  headers.set('Cache-Control', 'no-store');
}

// 设置 CORS 头部
function setCorsHeaders(headers) {
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
  headers.set('Access-Control-Allow-Headers', '*');
}

// 返回根目录的 HTML
function getRootHtml() {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>Cloudflare Workers Proxy</title>
</head>
<body>
  <h1>欢迎使用 Cloudflare Workers Proxy</h1>
  <!-- 这里可以添加你主页的其他内容 -->
</body>
</html>`;
}

