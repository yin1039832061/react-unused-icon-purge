const path = require('path');
const fs = require('fs');
const fsPromises = fs.promises;
const colors = require('colors');
const postcss = require('postcss');
const Ajv = require('ajv');
const ajv = new Ajv({ allErrors: true });
async function getConfig(root, configFile) {
    const res = await readFile(path.resolve(root, configFile));
    let obj;
    if (res) {
        try {
            obj = JSON.parse(res)
        } catch (err) {
            console.log(`[error]${colors.red(configFile + '\'content must be a json')}`)
        }
    }
    return obj;
}


async function readFile(filePath) {
    try {
        const data = await fsPromises.readFile(filePath, 'utf-8');
        return data;
    } catch (err) {
        // console.error(err,'-----------------------error');
        return null;
    }
}
// 生成最小字体文件目录路径
function generateMinFontPath(originalPath) {
    const parsed = path.parse(originalPath);
    parsed.name += '-min';  // Append "-min" to filename
    delete parsed.base;     // Force regeneration of base name
    delete parsed.ext;
    return path.format(parsed);
}
// 生成压缩后的css文件
async function generateMinifiedCSS({ originalCSSPath, usedClasses, minFontPath, iconPrefix, iconfontCssPath }) {
    try {
        const cssContent = await fsPromises.readFile(originalCSSPath, 'utf-8');
        const root = postcss.parse(cssContent);

        // 分两个阶段处理
        let headerContent = '';
        const newCSS = [];
        // 1. 提取头部 (@font-face 找到font-family)
        root.walk(node => {
            if (
                (node.type === 'atrule' && node.name === 'font-face')
            ) {
                headerContent += node.toString() + '\n';
                node.remove(); // 从原始树中移除已提取的节点
            }
        });
        //   2. 根据入参中的cssClass拷贝基础样式
        root.walk(node => {
            if (node.type === 'rule' && node.selector === `.${iconPrefix}`) {
                headerContent += node.toString() + '\n';
            }
        })
        // 2. 过滤需要保留的规则
        root.walkRules(rule => {
            const hasUsedClass = rule.selectors.some(selector =>
                usedClasses.some(cls => selector.includes(`.${cls}`))
            );
            if (!hasUsedClass) return;
            newCSS.push(rule.toString());
        });

        // 3. 生成最终内容
        const finalContent = [
            '/* Auto-generated minified iconfont */',
            headerContent.trim(),
            ...newCSS
        ].join('\n\n');
        // console.log(finalContent)
        const cssFiedName = path.basename(iconfontCssPath);
        const minCSSPath = path.join(minFontPath, cssFiedName);
        await fsPromises.writeFile(minCSSPath, finalContent);
        return minCSSPath;
    } catch (err) {
        console.log(`[error]${colors.red('\'generateMinifiedCSS error')}`, err)
    }
}
// get unicode by style class 
async function getUnicodeList(classNameList, cssFilePath) {
    const cssContent = await readFile(cssFilePath);
    const result = {};
    // 1. 解析 CSS 文件
    const root = postcss.parse(cssContent);
    // 2. 遍历所有规则
    root.walkRules(rule => {
        // 2.1 解析选择器，筛选类选择器
        let hasTargetClass = false;
        // console.log(rule, '=====rule')
        if (classNameList.some(cls => `.${cls}:before` == rule.selector)) {
            hasTargetClass = true;
        }
        if (!hasTargetClass) return;

        // 2.2 遍历规则中的声明
        rule.walkDecls('content', decl => {
            // 3. 提取 Unicode 编码
            if (decl.value && decl.value.startsWith('"\\')) {
                // 获取匹配的类名（可能多个）
                const matchedClasses = classNameList.filter(cls =>
                    rule.selectors.some(selector =>
                        selector.includes(`.${cls}`)
                    ));
                matchedClasses.forEach(cls => {
                    result[cls] = decl.value.replace(/^"|"$/g, '');;
                });
            }
        });
    });
    return result;
}

function safelyParseJSON(jsonString) {
    try {
        return JSON.parse(jsonString);
    } catch (error) {
        return null;
    }
}

function getTemplateLiteralClassName(expr) {
    const parts = [];
    const quasis = expr.quasis;
    const expressions = expr.expressions;
    const matchedClasses = new Set();

    for (let i = 0; i < quasis.length; i++) {
        const staticText = quasis[i].value.raw;
        parts.push({ type: 'static', value: staticText });
        if (i < expressions.length) {
            const expr = expressions[i];
            // 绑定动态表达式到前一个静态部分（如 `icon-` 对应第一个表达式）
            parts.push({
                type: 'expr',
                node: expr,
                prefix: staticText.match(/(\S+-$)/) ? staticText : null // 标记前缀（如 `icon-`）
            });
        }
    }
    function extractPossibleValues(node, prefix = '') {
        if (node.type === 'ConditionalExpression') {
            // 条件表达式：递归展开 true 和 false 分支
            return [
                ...extractPossibleValues(node.consequent, prefix),
                ...extractPossibleValues(node.alternate, prefix)
            ];
        } else if (node.type === 'StringLiteral') {
            // 字面量（如字符串）
            return [prefix + node.value]; // 拼接前缀（如 `icon-` + `aaaa`）
        }
        console.log(colors.yellow(`[warning]: ${node.name}非字面量类型，不进行替换`),)
        return [];
    }

    for (const part of parts) {
        if (part.type === 'expr') {
            const names = extractPossibleValues(part.node, part.prefix || '');
            names.forEach(name => {
                name.split(' ').forEach(n => n && matchedClasses.add(n));
            });
        }
    }
    return Array.from(matchedClasses);
}

const getFileType = (filePath) => {
    return new Promise((resolve, reject) => {
        fs.stat(filePath, (err, stats) => {
            if (err) {
                reject(`get file type error :${filePath}`)
            } else {
                if (stats.isDirectory()) {
                    resolve({ isDirectory: true })
                } else if (stats.isFile()) {
                    resolve({ isFile: true })
                } else {
                    resolve(null)
                }
            }
        })
    }).catch(err => {
        console.log(`[error]${colors.red(err)}`)
    })
}

async function readDir(entryPath, excludeFilePath, filePaths = []) {
    const res = await fsPromises.readdir(entryPath);
    if (Array.isArray(res) && res.length > 0) {
        for (let item of res) {
            let curPath = path.resolve(entryPath, item);
            if (excludeFilePath.includes(curPath)) {
                return;
            }
            const fileType = await getFileType(curPath);
            if (fileType.isDirectory) {
                await readDir(curPath, excludeFilePath, filePaths)
            } else if (fileType.isFile) {
                let reg = /^.*\.(?:jsx|tsx)$/i
                if (reg.test(curPath)) {
                    filePaths.push(curPath);
                }
            }
        }
    }
    return filePaths;
}

function validateConfigSchema(config) {
    const schema = {
        type: 'object',
        required: ['entry', 'iconfontCssPath', 'fontTTFPath', 'iconPrefix'],
        properties: {
            entry: {
                type: 'array',
                items: { type: 'string' },
                minItems: 1
            },
            iconfontCssPath: { type: 'string' },
            fontTTFPath: { type: 'string' },
            iconPrefix: { type: 'string' },
            excludeClasses: {
                type: 'array',
                items: { type: 'string' },
                default: []
            },
            excludeFilePath: {
                type: 'array',
                items: { type: 'string' },
                default: []
            }
        },
        additionalProperties: false
    }
    const validate = ajv.compile(schema)
    if (!validate(config)) {
        const errors = validate.errors.map(e =>
            `- ${e.instancePath} ${e.message} (${JSON.stringify(e.params)})`
        )
        throw new Error(`Invalid config:\n${errors.join('\n')}`)
    }
}

function validateFileExists(config, rootPath) {
    // 校验 iconfont.css 文件
    const cssPath = path.join(rootPath, config.iconfontCssPath)
    if (!fs.existsSync(cssPath)) {
        throw new Error(`iconfontCssPath 文件不存在: ${cssPath}`)
    }
    if (!cssPath.endsWith('.css')) {
        throw new Error('iconfontCssPath 必须指向 .css 文件')
    }

    // 校验字体文件
    const ttfPath = path.join(rootPath, config.fontTTFPath)
    if (!fs.existsSync(ttfPath)) {
        throw new Error(`字体文件不存在: ${ttfPath}`)
    }
    if (!['.ttf', '.otf'].some(ext => ttfPath.endsWith(ext))) {
        throw new Error('fontTTFPath 必须指向 .ttf 或 .otf 文件')
    }

    // 校验入口路径
    config.entry.forEach(dir => {
        const entryPath = path.join(rootPath, dir)
        if (!fs.existsSync(entryPath)) {
            throw new Error(`入口路径不存在: ${entryPath}`)
        }
        if (!fs.statSync(entryPath).isDirectory()) {
            throw new Error(`entry 必须为目录: ${entryPath}`)
        }
    })
}
module.exports = {
    generateMinFontPath,
    readFile,
    getConfig,
    generateMinifiedCSS,
    getUnicodeList,
    safelyParseJSON,
    getTemplateLiteralClassName,
    readDir,
    validateConfigSchema,
    validateFileExists
};