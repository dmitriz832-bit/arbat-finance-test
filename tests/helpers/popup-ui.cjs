/* Explicit popup decisions for isolated browser acceptance flows. */
const assert=require('node:assert/strict');
async function acceptConfirmation(page,message){const dialog=page.locator('.ft-confirm-dialog[open]');await dialog.waitFor({state:'visible'});if(message)assert.match(await dialog.locator('.ft-popup-message').innerText(),message);await dialog.locator('[data-popup-action=confirm]').click();await dialog.waitFor({state:'detached'})}
async function closeCard(page,selector){await page.locator(selector).click();if(await page.locator('.ft-confirm-dialog[open]').isVisible())await acceptConfirmation(page,/Закрыть карточку без сохранения/)}
async function dismissToast(page,message){const toast=page.locator('.ft-toast').filter({hasText:message}).last();await toast.waitFor({state:'visible'});await toast.locator('.ft-toast-close').click()}
function rejectNativeDialogs(page,errors){page.on('dialog',async dialog=>{errors.push('Unexpected native '+dialog.type()+': '+dialog.message());await dialog.dismiss()})}
module.exports={acceptConfirmation,closeCard,dismissToast,rejectNativeDialogs};
