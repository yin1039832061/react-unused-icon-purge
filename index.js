const path = require('path');
const colors = require('colors');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const {
    readFile,
    generateMinFontPath,
    generateMinifiedCSS,
    getUnicodeList,
    safelyParseJSON,
    getTemplateLiteralClassName,
    readDir
} = require('./utils/index');

const configFile = 'react-unused-icon-purge.json';

let config = {};

const projectRootPath = process.cwd();

/**
 * 从 content 属性值中解析 Unicode
 * @param {string} value - content 属性值
 * @returns {string | null} - 十六进制 Unicode 编码（如 e600）
 */
function parseUnicodeFromContent(value) {
    if (value.startsWith('\\')) {
        value = value.replace(/\\/g, '');
    }
    return value.startsWith('u') ? value.slice(1) : value;
}

async function init() {
    const tempConfig = await readFile(path.resolve(projectRootPath, configFile));
    config = safelyParseJSON(tempConfig) || {};
    const { iconfontCssPath, fontTTFPath, iconPrefix, excludeClasses } = config;
    const entry = Array.isArray(config.entry) ? config.entry : [];
    let excludeFilePath = Array.isArray(config.excludeFilePath) ? config.excludeFilePath : [];
    excludeFilePath = excludeFilePath.map(item => path.resolve(projectRootPath, item));
    const filePaths = [];
    const classNameList = new Set();
    if (entry.length > 0) {
        for (let item of entry) {
            let entryPath = path.join(projectRootPath, item);//遍历配置文件夹
            await readDir(entryPath, excludeFilePath, filePaths)
        }
    }
    // 扫描项目源代码，提取 CSS类名
    for (let file of filePaths) {
        const comContent = await readFile(file);
        const ast = parser.parse(comContent, { sourceType: 'module', plugins: ['jsx', 'typescript'] });
        // console.log(ast, 'ast')
        if (Array.isArray(excludeClasses) && excludeClasses.length) {
            excludeClasses.forEach(cls => classNameList.add(cls));
        }
        traverse(ast, {
            JSXAttribute(path) {
                if (path.node.name.name === 'className') {
                    const value = path.node.value;
                    if (value.type === 'StringLiteral') {
                        if (value.value.includes(' ')) {
                            value.value.split(' ').forEach(cls => cls && classNameList.add(cls));
                        } else {
                            classNameList.add(value.value);
                        }
                    }
                    if (value.type === 'JSXExpressionContainer') {
                        const expr = value.expression;
                        // 处理模板字符串
                        if (expr.type === 'TemplateLiteral') {
                            const templateClasses = getTemplateLiteralClassName(expr);
                            templateClasses.forEach(cls => {
                                classNameList.add(cls);
                            });
                        } else if (expr.type === "CallExpression") {
                            // 处理classname插件方法调用
                            const args = expr.arguments;
                            for (let arg of args) {
                                if (arg.type === "StringLiteral") {
                                    arg.value.split(' ').forEach(cls => cls && classNameList.add(cls));
                                } else if (arg.type === "ObjectExpression") {
                                    arg.properties.forEach(prop => {
                                        if (prop?.key?.type === "StringLiteral") {
                                            prop.key.value?.split(' ').forEach(c => c && classNameList.add(c))
                                        }
                                    })
                                } else if (arg.type === "TemplateLiteral") {
                                    const templateClasses = getTemplateLiteralClassName(arg);
                                    templateClasses.forEach(cls => {
                                        classNameList.add(cls);
                                    });
                                }
                            }
                        }
                    }
                }
            }
        });
    }
    // 
    const cssFilePath = path.join(projectRootPath, iconfontCssPath);
    // 获取对应css类名的Unicode编码
    const usedUniCodeMap = await getUnicodeList(Array.from(classNameList), cssFilePath);
    console.log(usedUniCodeMap, 'usedUniCodeMap')

    const ttfPath = path.join(projectRootPath, fontTTFPath);
    const minFontPath = generateMinFontPath(ttfPath);
    const allUniCode = Object.values(usedUniCodeMap);
    if (!(Array.isArray(allUniCode) && allUniCode.length)) return;
    const allUniCodeStr = allUniCode.map(item => {
        const str = parseUnicodeFromContent(item)
        const pointCode = String.fromCodePoint(parseInt(str, 16));
        return pointCode;
    }).join(',');
    // 剔除未使用的字体ttf和css类
    const Fontmin = (await import('fontmin')).default;
    const fontmin = new Fontmin()
        .src(ttfPath)
        .use(Fontmin.glyph({
            text: allUniCodeStr,
            hinting: false
        }))
        .dest(minFontPath)
    fontmin.run(async function (err, files) {
        if (err) {
            console.log(err, 'err')
        }
        const originalCSSPath = path.join(projectRootPath, iconfontCssPath);
        const cssPath = await generateMinifiedCSS({
            originalCSSPath,
            usedClasses: Object.keys(usedUniCodeMap),
            minFontPath,
            iconPrefix,
            iconfontCssPath
        });
        cssPath && console.log(`${colors.green('[success]: generate file success')}`)
    });

}
module.exports = {
    start: init,
}