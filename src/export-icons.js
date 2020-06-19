import sketch from 'sketch'
const Settings = require('sketch/settings');
const UI = require('sketch/ui')
const fetch = require("sketch-polyfill-fetch");
const fs = require("@skpm/fs");
import BrowserWindow from 'sketch-module-web-view'
import { getWebview } from 'sketch-module-web-view/remote'
import dialog from '@skpm/dialog'

const webviewIdentifier = 'icontocode.webview'

export default function () {

  const options = {
    identifier: webviewIdentifier,
    width: 400,
    minWidth: 400,
    maxWidth: 400,
    height: 800,
    minHeight: 800,
    maxHeight: 800,
    alwaysOnTop: true,
    show: false
  }

  const browserWindow = new BrowserWindow(options)

  // only show the window when the page has loaded to avoid a white flash
  browserWindow.once('ready-to-show', () => {
    browserWindow.show()
  })

  const webContents = browserWindow.webContents

  webContents.on('openUrl', url => {
    NSWorkspace.sharedWorkspace().openURL(NSURL.URLWithString(url));
  })

  // print a message when the page loads
  webContents.on('did-finish-load', () => {
    onSelection()
    var theme = UI.getTheme()
    webContents
        .executeJavaScript(`setInit(${JSON.stringify({theme})})`)
        .catch(console.error)
  })

  // add a handler for a call from web content's javascript
  webContents.on('nativeLog', s => {
    console.log('NATIVE LOG', s)
  })

  // add a handler for a call from web content's javascript
  webContents.on('getZip', (data) => {
    const json = JSON.parse(data);
    const url = json.url;
    const options = json.options;
    fetch(url, options).then(resp => {
      if (resp.status === 200) {
        return resp.arrayBuffer();
      }
      return null;
    }).then(buffer => {

      // Let user choose export directory
      let exportPath = '';
      const selected = dialog.showOpenDialogSync({
        title: 'Choose Export Directory',
        properties: ['openDirectory'],
        buttonLabel: 'Export Here'
      });

      // End early if they click cancel
      if (!selected.length) {
        webContents
            .executeJavaScript(`finishExport()`)
            .catch(console.error)
        return
      } else {
        exportPath = selected + '/sketch_icons_export.zip'
      }

      fs.writeFileSync(exportPath, buffer)

      webContents
          .executeJavaScript(`finishExport()`)
          .catch(console.error)

    }).catch(error => {
      webContents
          .executeJavaScript(`finishExport()`)
          .catch(console.error)
    })
  })

  browserWindow.loadURL(require('../resources/webview.html'))
}

// When the plugin is shutdown by Sketch (for example when the user disable the plugin)
// we need to close the webview if it's open
export function onShutdown() {
  const existingWebview = getWebview(webviewIdentifier)
  if (existingWebview) {
    existingWebview.close()
  }
}

const getWindow = () => {
  return BrowserWindow.fromId(webviewIdentifier);
};

function onSelection(context) {
  const segments = getSelectedItems()
  const browserWindow = getWindow()
  const webContents = browserWindow.webContents
  webContents
      .executeJavaScript(`setData(${JSON.stringify(segments)})`)
      .catch(console.error)
}

export function onSelectionChanged(context){
  try{
    onSelection(context)
  }catch(e){
    //console.log('SELECTION ERROR', e.message, e.stack)
  }
}

const getSelectedItems = () => {
  const document = sketch.getSelectedDocument();
  const selection = document.selectedLayers;
  const selectedPage = document.pages.find(page => page.selected);
  const exportWholePage = selection.layers.length === 0;
  let segments = [];

  selectedPage.layers.forEach((item) => {
    if(exportWholePage || item.selected){
      const segmentName = selectedPage.name;
      const icon = exportIcon(item)
      const existingSegment = segments.findIndex(seg => seg.name === segmentName);
      if(existingSegment !== -1){
        const lastIconListIndex = segments[existingSegment].icons.length - 1;
        const lastIconList = segments[existingSegment].icons[lastIconListIndex];
        if(lastIconList.length === 10){
          segments[existingSegment].icons.push([icon]);
        }else{
          lastIconList.push(icon);
        }
      }else{
        segments.push({ name: segmentName, icons: [[icon]] });
      }
    }
  });

  return segments;
}

const exportIcon = (layer) => {
  if (layer.type === 'Artboard' || layer.type === 'Group' || layer.type === 'Shape') {
    const icon = layer;
    const options = { formats: 'svg' , output: false,  compact: true};
    // If output: true will be exported to ~/Documents/Sketch Exports when output = true
    let svgFile = sketch.export(icon, options);
    return {'svg': svgFile, 'name': layer.name};
  }
};
