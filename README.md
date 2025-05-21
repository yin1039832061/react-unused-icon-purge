# React Unused Icon Purge 🧹
Automatically detect and remove unused icons from React projects, reducing bundle size. 🔍🗑️

## Use it
* Installation Node >=18 is required for installation.

global install

`Yarn`
```bash
yarn global add react-unused-icon-purge
```

`NPM`
```bash
npm install -g react-unused-icon-purge
```

package install

`Yarn`
```bash
yarn add react-unused-icon-purge --dev
```

`NPM`
```bash
npm install react-unused-icon-purge --save-dev
```
## 🚀 Quick Start
1. Create config file `react-unused-icon-purge.config.js` in your project root directory:

```json
{
    "iconfontCssPath":"./src/statics/css/iconfont.css",// iconfont.css path
    "fontTTFPath":"./src/statics/css/iconfont.ttf",// iconfont.ttf path
    "iconPrefix":"iconfont",// iconfont prefix
    "excludeClasses":["icon-xxx"],//  Icon class names to exclude (dynamic icon classes not covered by static analysis)
    "entry":["/src"]// entry file path
}
```

2. Add to build script

```json
"scripts": {
    "react-unused-icon-purge": "react-unused-icon-purge"
}
```

3. Execute Command 

Run in project root:
```bash
npm run react-unused-icon-purge
or
yarn react-unused-icon-purge
or
react-unused-icon-purge
```

This will generate a *-min folder next to your original TTF file containing:
 * Optimized CSS file with only used icons
 * Minified TTF font file 

4. Verify & Replace Files 

    Replace global CSS reference: 
    
     ```javascript
    // Before
    import './statics/css/iconfont.css'; 
    // After
    import './statics/css/iconfont-min/iconfont.css';
    ```
## ⚙️ Configuration

| Option        | Type               | Default       | Description                              |
|---------------|--------------------|---------------|------------------------------------------|
| `entry` | string[]         | **Required**  | entry file path       |
| `iconfontCssPath` | string          | **Required**  | iconfont.css path assets       |
| `fontTTFPath`     | string | **Required**         | iconfont.ttf path         |
| `iconPrefix`  | string             | **Required**        | iconfont prefix            |
| `excludeClasses`| string[]            | `[]`       |  Icon class names to exclude (dynamic icon classes not covered by static analysis)    |

## 🐛 Issue Reporting
Found a bug? Have a suggestion? Please [open an issue](https://github.com/yin1039832061/react-unused-icon-purge/issues)  
