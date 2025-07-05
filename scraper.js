import puppeteer from 'puppeteer';
let intervalId = null;
// Run the task every 1 minute
const interval = 5 * 60 * 1000;
// const interval = 30 * 1000;
const FORBIDDEN_TEXT = [' PC', ' TYPE']
let browser;
let running = false;

// Function to delay
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
async function restoreSession(browser) {
  // Load cookies if available
  await browser.setCookie(...cookies);
  console.log('Cookies restored!');
}

// Function to log output to txt file
export function log(message) {
  const timestamp = new Date().toLocaleString(); // Getting the current timestamp
  const logMessage = `[${timestamp}] ${message}\n`; // Formatting the log message with a timestamp
  console.log(logMessage)
}

const findTextToClick = async (text) => {
  const xpath = `//*[contains(text(), '${text}')]`;
  const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
  return result.singleNodeValue;
}

const clickFilters = async (iframe, trainingLocation) => {
  // Click filters at top of page
  const a230Handle = await iframe.evaluateHandle(findTextToClick, 'A320');
  const trainingLocationHandle = await iframe.evaluateHandle(findTextToClick, trainingLocation);
  const instructorHandle = await iframe.evaluateHandle(findTextToClick, 'Instructor');
  const seatSupportHandle = await iframe.evaluateHandle(findTextToClick, 'Seat Support');

  if (a230Handle) {
    // Click the element
    await a230Handle.asElement().click();
    await trainingLocationHandle.asElement().click();
    await instructorHandle.asElement().click();
    await seatSupportHandle.asElement().click();
  } else {
    throw new Error(`No element found containing text`);
  }
}

// Returns array of child selectors
const waitForGalleryWindow = async (iframe) => {
  const galleryWindowSelector = '.react-gallery-items-window';
  const galleryItemSelector = '.virtualized-gallery-item';
  await iframe.waitForSelector(galleryItemSelector);

  const childSelectors = await iframe.evaluate((selector) => {
    const parentDiv = document.querySelector(selector);
    if (parentDiv) {
      // Generate unique selectors for each child
      return Array.from(parentDiv.children).map((child, index) => {
        child.setAttribute('data-index', index); // Add a temporary unique attribute
        return `${selector} > [data-index="${index}"]`;
      });
    }
    return [];
  }, galleryWindowSelector);
  return childSelectors;
}

const getSelectorText = async (iframe, selector) => {
  const text = await iframe.evaluate(
    (selector) => {
      const element = document.querySelector(selector);
      if (!element) return false;
      const content = element.innerText;
      return content
    },
    selector
  );

  return text
}

const performTask = async (trainingLocation, lastDate) => {
  try {
    browser = await puppeteer.launch({ headless: true }); // Open visible browser windowclea

    const pages = await browser.pages();
    const page = pages[0];

    await page.goto('https://google.com');
    await restoreSession(browser);
    await page.goto('https://apps.powerapps.com/play/e/default-3fa43375-3934-4045-8aaa-43aaf7bf586c/a/d57bc819-203e-4de5-9ab8-69f64596cf4b?tenantId=3fa43375-3934-4045-8aaa-43aaf7bf586c&sourcetime=1717169161879');

    await delay(5000);

    const iframeSelector = "#fullscreen-app-host"
    await page.waitForSelector(iframeSelector);

    // Get the iframe element handle
    const iframeElement = await page.$(iframeSelector);

    // Get the iframe's content frame
    const iframe = await iframeElement.contentFrame();

    log('Performing task');

    if (!iframe) console.error("Could not access the iframe content.");

    await iframe.waitForSelector('.appmagic-checkbox')

    await clickFilters(iframe, trainingLocation);

    let childSelectors = [];
    try {
      childSelectors = await waitForGalleryWindow(iframe);
    } catch (err) {
      log('No Items Present')
    }

    for (const childSelector of childSelectors) {
      await iframe.waitForSelector(childSelector); // Ensure the child is present
      await iframe.click(childSelector);
      log(`Clicked on: ${childSelector}`);
      const eventNameSelector = '[data-control-name="Label_EventName_1"]';
      const eventStartSelector = '[data-control-name="Label_EventStart_1"]';
      const eventPositionSelector = '[data-control-name="Label_Position_1"]';
      await iframe.waitForSelector(eventNameSelector); // Ensure the child is present

      const eventName = await getSelectorText(iframe, eventNameSelector);
      const eventStart = await getSelectorText(iframe, eventStartSelector);
      const eventPosition = await getSelectorText(iframe, eventPositionSelector);
      if (FORBIDDEN_TEXT.some(text => eventName.includes(text) && eventPosition.toLowerCase().includes('instructor')) || lastDate < new Date(eventStart)) {
        log(`Skipped item: ${eventName} - ${new Date(eventStart).toLocaleString()}`)
        continue;
      } else {
        await delay(1000);
        const bidButtonSelector = '[data-control-name="Button-SubmitBidForEvent"]'
        await iframe.waitForSelector(bidButtonSelector);
        const bidButtonHandle = await iframe.evaluateHandle(findTextToClick, 'Bid for this event ');
        if (bidButtonHandle.asElement()) {
          await bidButtonHandle.asElement().click();

          const confirmBidSelector = '[data-control-name="Button_ConfirmBid"]';
          await iframe.waitForSelector(confirmBidSelector);
          const confirmBidHandle = await iframe.evaluateHandle(findTextToClick, 'Confirm');
          if (!confirmBidHandle.asElement()) return
          await confirmBidHandle.asElement().click();
          await delay(1000);
        }
      }
    }
    browser.close();
    browser = null;
    if (running) {
      return setTimeout(() => performTask(trainingLocation, lastDate), interval)
    } else {
      return
    }
  } catch (err) {
    log(`Something went wrong`)
    log(err)
    if (running) {
      return setTimeout(() => performTask(trainingLocation, lastDate), interval)
    } else {
      return
    }
  };
}

export async function startAutoBidder({ trainingLocation, lastDate }) {
  try {
    log(`Starting periodic task...`);
    running = true;
    await performTask(trainingLocation, new Date(lastDate));
    // intervalId = setInterval(performTask, interval, trainingLocation, new Date(lastDate))


    // NOTE: These are for testing purposes
    // intervalId = setInterval(async () => await page.reload(), interval, trainingLocation, page)
    // performTask(page, trainingLocation, new Date(lastDate));
  } catch (err) {
    log(err)
  }
};

export const stopAutoBidder = () => {
  log(`Terminated Task`)
  running = false;
  // if (browser) {
  //   browser.close();
  //   browser = null;
  // }
  // if (intervalId) {
  //   log(`Terminated Task`)
  //   clearInterval(intervalId);
  //   intervalId = null;
  //   if (browser) {
  //     browser.close();
  //     browser = null;
  //   }
  // }
}

export const saveCookies = async () => {
  if (browser) {
    // Save Cookies
    const cookies = await browser.cookies();
    console.log(cookies)
  }
}


// TODO: Everytime the password changes, we need to change this variable with new cookies
var cookies = [
  {
    name: 'MicrosoftApplicationsTelemetryDeviceId',
    value: '6266cca2-03ac-409e-b4b4-073e66efd3f8',
    domain: 'apps.powerapps.com',
    path: '/play/e/default-3fa43375-3934-4045-8aaa-43aaf7bf586c/a',
    expires: 1786315587.433546,
    size: 74,
    httpOnly: false,
    secure: false,
    session: false,
    priority: 'Medium',
    sameParty: false,
    sourceScheme: 'Secure',
    sourcePort: 443,
    partitionKey: undefined
  },
  {
    name: 'MicrosoftApplicationsTelemetryFirstLaunchTime',
    value: '2025-03-08T16:22:46.581Z',
    domain: 'apps.powerapps.com',
    path: '/play/e/default-3fa43375-3934-4045-8aaa-43aaf7bf586c/a',
    expires: 1786315587.433559,
    size: 69,
    httpOnly: false,
    secure: false,
    session: false,
    priority: 'Medium',
    sameParty: false,
    sourceScheme: 'Secure',
    sourcePort: 443,
    partitionKey: undefined
  },
  {
    name: 'PA_GeoRegion_default-3fa43375-3934-4045-8aaa-43aaf7bf586c',
    value: 'unitedstates',
    domain: 'apps.powerapps.com',
    path: '/play/e/default-3fa43375-3934-4045-8aaa-43aaf7bf586c/',
    expires: 1754347630,
    size: 69,
    httpOnly: false,
    secure: true,
    session: false,
    sameSite: 'None',
    priority: 'Medium',
    sameParty: false,
    sourceScheme: 'Secure',
    sourcePort: 443,
    partitionKey: undefined
  },
  {
    name: 'PAOrgSettingsV2',
    value: '%7B%22contentsecuritypolicyoptions%22%3A0%2C%22iscookieexpiryshortened%22%3Afalse%2C%22tenantid%22%3A%223fa43375-3934-4045-8aaa-43aaf7bf586c%22%7D',
    domain: 'apps.powerapps.com',
    path: '/play/e/default-3fa43375-3934-4045-8aaa-43aaf7bf586c',
    expires: 1754347632.027487,
    size: 161,
    httpOnly: true,
    secure: true,
    session: false,
    sameSite: 'None',
    priority: 'Medium',
    sameParty: false,
    sourceScheme: 'Secure',
    sourcePort: 443,
    partitionKey: undefined
  },
  {
    name: 'SESSION',
    value: 'MTgwZGI0ZjYtZTVhMi00MDU1LTk0NjAtMmRjZjBkOTc3ZGU4',
    domain: 'authenticator.pingone.com',
    path: '/pingid',
    expires: -1,
    size: 55,
    httpOnly: true,
    secure: true,
    session: true,
    priority: 'Medium',
    sameParty: false,
    sourceScheme: 'Secure',
    sourcePort: 443,
    partitionKey: undefined
  },
  {
    name: 'OGPC',
    value: '19046228-1:',
    domain: '.google.com',
    path: '/',
    expires: 1786315587.433586,
    size: 15,
    httpOnly: false,
    secure: false,
    session: false,
    priority: 'Medium',
    sameParty: false,
    sourceScheme: 'Secure',
    sourcePort: 443,
    partitionKey: undefined
  },
  {
    name: 'AEC',
    value: 'AVcja2dTUVzktWcj42HoKjamTvwimc3uJSpf6MjlokWqPvpxIH8BQSQrAg',
    domain: '.google.com',
    path: '/',
    expires: 1786315587.433592,
    size: 61,
    httpOnly: true,
    secure: true,
    session: false,
    sameSite: 'Lax',
    priority: 'Medium',
    sameParty: false,
    sourceScheme: 'Secure',
    sourcePort: 443,
    partitionKey: undefined
  },
  {
    name: 'OTZ',
    value: '7985783_84_84_104220_80_446880',
    domain: 'ogs.google.com',
    path: '/',
    expires: 1786315587.433597,
    size: 33,
    httpOnly: false,
    secure: true,
    session: false,
    priority: 'Medium',
    sameParty: false,
    sourceScheme: 'Secure',
    sourcePort: 443,
    partitionKey: undefined
  },
  {
    name: 'x-ms-gateway-slice',
    value: 'estsfd',
    domain: 'login.microsoftonline.com',
    path: '/',
    expires: -1,
    size: 24,
    httpOnly: true,
    secure: true,
    session: true,
    sameSite: 'None',
    priority: 'Medium',
    sameParty: false,
    sourceScheme: 'Secure',
    sourcePort: 443,
    partitionKey: undefined
  },
  {
    name: 'stsservicecookie',
    value: 'estsfd',
    domain: 'login.microsoftonline.com',
    path: '/',
    expires: -1,
    size: 22,
    httpOnly: true,
    secure: true,
    session: true,
    sameSite: 'None',
    priority: 'Medium',
    sameParty: false,
    sourceScheme: 'Secure',
    sourcePort: 443,
    partitionKey: undefined
  },
  {
    name: 'AADSSO',
    value: 'NA|NoExtension',
    domain: '.login.microsoftonline.com',
    path: '/',
    expires: -1,
    size: 20,
    httpOnly: false,
    secure: true,
    session: true,
    sameSite: 'None',
    priority: 'Medium',
    sameParty: false,
    sourceScheme: 'Secure',
    sourcePort: 443,
    partitionKey: undefined
  },
  {
    name: 'MicrosoftApplicationsTelemetryDeviceId',
    value: '93868e99-cdf6-4e9c-a762-f0de31475de4',
    domain: 'login.microsoftonline.com',
    path: '/',
    expires: 1783291628.788312,
    size: 74,
    httpOnly: false,
    secure: true,
    session: false,
    sameSite: 'None',
    priority: 'Medium',
    sameParty: false,
    sourceScheme: 'Secure',
    sourcePort: 443,
    partitionKey: undefined
  },
  {
    name: 'brcap',
    value: '0',
    domain: '.login.microsoftonline.com',
    path: '/',
    expires: 1785451589,
    size: 6,
    httpOnly: false,
    secure: true,
    session: false,
    sameSite: 'None',
    priority: 'Medium',
    sameParty: false,
    sourceScheme: 'Secure',
    sourcePort: 443,
    partitionKey: undefined
  },
  {
    name: 'MSFPC',
    value: 'GUID=1761cf5f18a54e7fac3e172e801570dc&HASH=1761&LV=202503&V=4&LU=1741451080216',
    domain: 'login.microsoftonline.com',
    path: '/',
    expires: 1772987079.97162,
    size: 83,
    httpOnly: false,
    secure: true,
    session: false,
    sameSite: 'None',
    priority: 'Medium',
    sameParty: false,
    sourceScheme: 'Secure',
    sourcePort: 443,
    partitionKey: undefined
  },
  {
    name: 'BIGipServervswcrp-secpng_pool',
    value: '!rre4otp8WjbmyGrA2Oheh26wzj0eNJFdgFUynQvHIGg1HgsOQhIoLfGvXr2jjYMU5OniYwpXjJfgYA==',
    domain: 'rso.allegiantair.com',
    path: '/',
    expires: -1,
    size: 110,
    httpOnly: true,
    secure: true,
    session: true,
    priority: 'Medium',
    sameParty: false,
    sourceScheme: 'Secure',
    sourcePort: 443,
    partitionKey: undefined
  },
  {
    name: '_singlepoint_ngx_carma_id',
    value: 'ebb5401c-7241-4905-8b9f-bfd58172a9a8',
    domain: '.allegiantair.auth.securid.com',
    path: '/',
    expires: 1776011093.92979,
    size: 61,
    httpOnly: false,
    secure: true,
    session: false,
    sameSite: 'None',
    priority: 'Medium',
    sameParty: false,
    sourceScheme: 'Secure',
    sourcePort: 443,
    partitionKey: undefined
  },
  {
    name: 'primary_auth_method',
    value: 'NAN',
    domain: 'allegiantair.auth.securid.com',
    path: '/',
    expires: -1,
    size: 22,
    httpOnly: false,
    secure: true,
    session: true,
    sameSite: 'None',
    priority: 'Medium',
    sameParty: false,
    sourceScheme: 'Secure',
    sourcePort: 443,
    partitionKey: undefined
  },
  {
    name: 'step_up_auth_method',
    value: 'NAN',
    domain: 'allegiantair.auth.securid.com',
    path: '/',
    expires: -1,
    size: 22,
    httpOnly: false,
    secure: true,
    session: true,
    sameSite: 'None',
    priority: 'Medium',
    sameParty: false,
    sourceScheme: 'Secure',
    sourcePort: 443,
    partitionKey: undefined
  },
  {
    name: 'SECURIDSESSION',
    value: 'ZmI5MzllNmYtN2MwMi00NDRjLWFlN2ItODkwYWFiYWJiYjk3',
    domain: 'allegiantair.auth.securid.com',
    path: '/',
    expires: -1,
    size: 62,
    httpOnly: true,
    secure: true,
    session: true,
    sameSite: 'None',
    priority: 'Medium',
    sameParty: false,
    sourceScheme: 'Secure',
    sourcePort: 443,
    partitionKey: undefined
  },
  {
    name: 'MicrosoftApplicationsTelemetryDeviceId',
    value: '6266cca2-03ac-409e-b4b4-073e66efd3f8',
    domain: 'apps.powerapps.com',
    path: '/',
    expires: 1783291630.520731,
    size: 74,
    httpOnly: false,
    secure: true,
    session: false,
    sameSite: 'None',
    priority: 'Medium',
    sameParty: false,
    sourceScheme: 'Secure',
    sourcePort: 443,
    partitionKey: undefined
  },
  {
    name: 'NID',
    value: '525=YBunVnFAC8jgLzBXt1WwPMjT4Cvgv5be2pbo1C4CeqYF6KNwoYLVIMIJ696fGixskceWBW3dxQ9ThO5PduEdRCfNtB1HI5rrRiWAaZFtoqrLvl_ukw80F6ohed8uE2Fp-hJixM7Sg0RCSJ_uK_MRoQusy9bQqob9W_8JLU_VUXqzj6vlDQWP34yZC543IUzTDNrfEMIZVvauKihkzYzR_d_ZpyfGoMZ4z60',
    domain: '.google.com',
    path: '/',
    expires: 1767566787.621153,
    size: 234,
    httpOnly: true,
    secure: true,
    session: false,
    sameSite: 'None',
    priority: 'Medium',
    sameParty: false,
    sourceScheme: 'Secure',
    sourcePort: 443,
    partitionKey: undefined
  },
  {
    name: 'PACookieRolloutBucket_prod',
    value: 'CSPForceReportViolation%3A50%26PCFAuthCAE%3A58%26TeamsSettingsRedirect%3A39%26TrialPageUrlRedirect%3A28%26IsAppFramePreloadKillSwitchEnabled%3A72%26EnableDraftPreview%3A94%26UseRootMainForModelApps%3A33%26HandlebarsPages%3A49%26ShowTrialBanner%3A28%26EnableInlineNsatUI%3A24%26CopilotAdorner%3A83%26CopilotAdornerPowerBI%3A89%26CopilotAdornerSharePointForm%3A90%26CopilotAdornerSharePointWebPart%3A7%26CopilotAdornerTeams%3A84%26CopilotAdornerIFrame%3A85%26CopilotAdornerNl2Query%3A82%26CopilotAdornerNl2QueryOnHover%3A56%26CopilotAdornerNl2QueryForSQL%3A61%26CopilotSidecar%3A85%26CopilotSidecarOCVFeedback%3A27%26CopilotSidecarLandingCard%3A88%26TrustedUCIAppLifecycleV2%3A17%26OnePlayerEnableAuthCAE%3A93%26OnePlayerTeamsEnableAuthCAE%3A58%26CanvasAppHealthPage%3A67%26EnableWebAuthResourceForMonitors%3A25%26EnableDescriptionCallout%3A30%26UsePowerPlatformAPI%3A3%26EnableAbortController%3A27%26EnableXhrReplacement%3A85%26EnableNativePromise%3A69%26CopilotSidecarRecordPicker%3A62%26PreloadRequestsForAppStart%3A40%26DraftCoPilotV2PromptSuggestions%3A53%26DraftCoPilotV2DefaultSkill%3A33%26DraftWithCopilotPromptVersionV2%3A42%26DraftWithCopilotGenerate%3A36%26EnableWebPlayerDraftPreview%3A43%26EnableCatchUpCallout%3A25%26EnableNewPublishedAppEndpoints%3A89%26EnableCopilotUpsell%3A38%26EnableMsalV3OnStandalone%3A95%26EnableMsalV3OnAppHost%3A40%26EnableMsalV3OnTeams%3A34%26EnableMsalV3OnEmbedded%3A19%26WebPlayerAuthExpiryBuffer%3A24%26WebPlayerAuthDefaultExpiry%3A26%26UseV2MonitoringHub%3A11%26EnableAppRedirect%3A96%26EnableEnvironmentRouteExchange%3A99%26EnableEnvironmentRouteObo%3A30',
    domain: 'apps.powerapps.com',
    path: '/',
    expires: 1756939587.698014,
    size: 1624,
    httpOnly: true,
    secure: true,
    session: false,
    sameSite: 'None',
    priority: 'Medium',
    sameParty: false,
    sourceScheme: 'Secure',
    sourcePort: 443,
    partitionKey: undefined
  },
  {
    name: 'esctx-HoQsIf08QqU',
    value: 'AQABCQEAAABVrSpeuWamRam2jAF1XRQEKRQf97uuKnL5kSWNajVgQBvgfrae-WJwNk-XAGWQhvXcVF40CmvJFr33mPYL29LwWx-ZdmTKlcRDgXUDixF7HF2EQyx30ZsYD9rmmhhxSBH22IlTksmkg7EjO3kKlXdF6uOIIpEfBa43eVtUl61oBiAA',
    domain: '.login.microsoftonline.com',
    path: '/',
    expires: -1,
    size: 201,
    httpOnly: true,
    secure: true,
    session: true,
    sameSite: 'None',
    priority: 'Medium',
    sameParty: false,
    sourceScheme: 'Secure',
    sourcePort: 443,
    partitionKey: undefined
  },
  {
    name: '__cf_bm',
    value: 'Q1jFabnY45nlt8Bph6Uk0JbM3Bhl.xp0lqZetjhzs00-1751755600-1.0.1.1-7Ctx5yLWDYAtjoin2.E25TvEIWGo.S1akzpCOWK2bUrN9XFBa_HYSPlWA_UDaWrlBruZYfvPEM7ik9.FsXS2yNLr7_W5ksom3LjGpBzybdbKqU9lHgxDJrAQsEpl.wGu',       
    domain: '.allegiantair.com',
    path: '/',
    expires: 1751757400.6862,
    size: 198,
    httpOnly: true,
    secure: true,
    session: false,
    sameSite: 'None',
    priority: 'Medium',
    sameParty: false,
    sourceScheme: 'Secure',
    sourcePort: 443,
    partitionKey: undefined
  },
  {
    name: 'PF',
    value: '4DLLLjgJduxb5hxtHBAqa9513tedkYBlyRQFYYCO8qao',
    domain: 'rso.allegiantair.com',
    path: '/',
    expires: -1,
    size: 46,
    httpOnly: true,
    secure: true,
    session: true,
    sameSite: 'None',
    priority: 'Medium',
    sameParty: false,
    sourceScheme: 'Secure',
    sourcePort: 443,
    partitionKey: undefined
  },
  {
    name: '.csrf',
    value: '5558c23e-a3a6-40be-9227-764f57b62519',
    domain: 'authenticator.pingone.com',
    path: '/',
    expires: -1,
    size: 41,
    httpOnly: true,
    secure: true,
    session: true,
    priority: 'Medium',
    sameParty: false,
    sourceScheme: 'Secure',
    sourcePort: 443,
    partitionKey: undefined
  },
  {
    name: '.pid',
    value: 'eyJ0dGwiOiIyMDI2LTA3LTA1VDIyOjQ3OjA0LjczNSIsInppcCI6IkRFRiIsImFsZyI6IkEyNTZLVyIsImVuYyI6IkExMjhDQkMtSFMyNTYifQ.b7GguiIaxDXAEf0lAY-RSYn1yJMA9Q5ea9eo0tLVdCg5NVlL8eneTA._9J_SYfsQJHxpa3w_QBnWA.QJ_AvkpqQAFoasGzOwaAZw0dMDjQFGaEUROjtXbUqfzkb9LvThcHAfreJqLf7vATOU5gbLxIOisUVn7b2hwjYHpWxa0HTcYxUT5rTygMvgzk1N4dqkn2G94P_2r0AOu4CQdwWGcubLYFUNdB2x8d3iMT1Wwl5YDJVzLFIbKKJhK9KpSDozOxVAXeWzB0vG7j3R1gZRp_TMOblB6iWH6bcQ6KgWEb4vRr10mDN8_AVy2J8iLmcF8viUA0fAM-bqjS_IFSMkhPPr-CUpEeQKznfmeJJDbhluNromBqjClVH5o5XUNo9Q6cvc6g2wBji8MH1wVAjzIvYnAPE_sBH3rmlfRdrtSRfMa9by4Yw4_bEEKlgwPsTneR_dCqFaHYvLsULmea4LuelPlQz4sP3ngNbUy-0UFhokWn3aKLMcDI7gIT-GSchOr-2p7McKOcxR7s6_WViCRzGoEAvb028iYQri-qTUsFretjvWPLHABrOaYeC1qcY2_SdSyuE9bCsPqQwBVpRrqkbDWrxMIohkzYMOK-OSg3YoNTdioeZobPTudf-hXs7iZPpYe77IHg5Pv1zi_I-LV-0iB2rwUGXhYUZi40iZ-ROBQDDmNxXD3-i-mBfW-MYNkCaJqjZAidjAZ6PRREKBuuuGzN2hfYMzzD2QfJ9YZY26d_GBklIuT4uKu3BedaIMBeFibtSnFuF8w_5dAUdYtmYFS9UeFh0XDIpId-J5UosSP6M5Zxhj5gu0I.tgu29nmJtmwkVct6xpW9aQ',
    domain: 'authenticator.pingone.com',
    path: '/',
    expires: 1783312578.572452,
    size: 963,
    httpOnly: true,
    secure: true,
    session: false,
    priority: 'Medium',
    sameParty: false,
    sourceScheme: 'Secure',
    sourcePort: 443,
    partitionKey: undefined
  },
  {
    name: '.lst',
    value: 'eyJ0dGwiOiIyMDI1LTA3LTA2VDIyOjQ3OjA2LjgwNCIsInppcCI6IkRFRiIsImFsZyI6IkEyNTZLVyIsImVuYyI6IkExMjhDQkMtSFMyNTYifQ.DsYt3K7ZQ_h2MNNammutw1r2DXWj-bM6rLEmM35zLuQWl2cuz09N1A.tlWVixYCssNAyJrQ4c3SmA.2RyHJjzzKukmRm6ZgxFA-e25i6XdgwP3dAcYtAhvKdhnbPEWSh_7dSQQv-x3ei3NlIs6-3SLFv9TP-lZAIz6OhdTXpJokNTaajnRWfvESkbuBhg45SzU0afIpzchNDlvg_M3lpMF0yEMOaApjQGQ4YL1L5dXPh43VkWE2S7gdT4.q7WMH_uN5b6yYJdX9Gn8_w',
    domain: 'authenticator.pingone.com',
    path: '/',
    expires: 1751755926.572557,
    size: 387,
    httpOnly: true,
    secure: true,
    session: false,
    priority: 'Medium',
    sameParty: false,
    sourceScheme: 'Secure',
    sourcePort: 443,
    partitionKey: undefined
  },
  {
    name: 'PingIDRequestedUserNameCookie',
    value: 'eyJhbGciOiJkaXIiLCJlbmMiOiJBMTI4Q0JDLUhTMjU2In0..VRDT0OiUYOtBBvnuD5_TCQ.KOnwKiZ3SPxnR2X2QAKjQASCAbcqmbx3-DlHvJ_JE0A.ELhKiq84PsVzBvIpo2rwdw',
    domain: 'rso.allegiantair.com',
    path: '/',
    expires: -1,
    size: 167,
    httpOnly: true,
    secure: true,
    session: true,
    sameSite: 'None',
    priority: 'Medium',
    sameParty: false,
    sourceScheme: 'Secure',
    sourcePort: 443,
    partitionKey: undefined
  },
  {
    name: 'PingIDUserCookie',
    value: 'eyJhbGciOiJkaXIiLCJlbmMiOiJBMTI4Q0JDLUhTMjU2In0..styJ1iWmioGsplv3WNoJfA.qnpdQ2A4nxCxAIqTS_-Jy_TKZveYUT1rpPhyoD95UaE.6BISyhmgaQWF3xQiZXMXGQ',
    domain: 'rso.allegiantair.com',
    path: '/',
    expires: -1,
    size: 154,
    httpOnly: true,
    secure: true,
    session: true,
    sameSite: 'None',
    priority: 'Medium',
    sameParty: false,
    sourceScheme: 'Secure',
    sourcePort: 443,
    partitionKey: undefined
  },
  {
    name: 'ESTSAUTHLIGHT',
    value: '+006b9af9-bd62-f12d-ad8d-9d16bd836661',
    domain: 'login.microsoftonline.com',
    path: '/',
    expires: -1,
    size: 50,
    httpOnly: false,
    secure: true,
    session: true,
    sameSite: 'None',
    priority: 'Medium',
    sameParty: false,
    sourceScheme: 'Secure',
    sourcePort: 443,
    partitionKey: undefined
  },
  {
    name: 'esctx',
    value: 'PAQABBwEAAABVrSpeuWamRam2jAF1XRQEDOHMyZQcqChb-x7BfgHzd3FcefpaXMwDb6tVw7r11LhD__Ao8k51jLprup4Ih-K_Z69hHEo4t_d2_Z0AA0FnN9M27_0wcPrTODsEmoRY35ORcFQh3rFC3NZgam0gCNUeQuadKn12SfdWn9mx0D4W3pqVhCow08Sbk5eeVs3fOMsgAA',
    domain: '.login.microsoftonline.com',
    path: '/',
    expires: -1,
    size: 212,
    httpOnly: true,
    secure: true,
    session: true,
    sameSite: 'None',
    priority: 'Medium',
    sameParty: false,
    sourceScheme: 'Secure',
    sourcePort: 443,
    partitionKey: undefined
  },
  {
    name: 'esctx-wIAPv4Pwvws',
    value: 'AQABCQEAAABVrSpeuWamRam2jAF1XRQEA2BPRldLNAfe8J3-Xc64Zsw7x3bsNFnmHLtA5mrhwwwR5t-pp4369k5mHjwACb24md5z1VMdv0lfHbI3kRB667ArgtJ8K8xsPx4dCWDHyvHsk1jGKGdNQx8Whvf6StHJu7LcJ7zv7A0Sg4iTGeV54SAA',
    domain: '.login.microsoftonline.com',
    path: '/',
    expires: -1,
    size: 201,
    httpOnly: true,
    secure: true,
    session: true,
    sameSite: 'None',
    priority: 'Medium',
    sameParty: false,
    sourceScheme: 'Secure',
    sourcePort: 443,
    partitionKey: undefined
  },
  {
    name: 'CCState',
    value: 'RWhJS0VDSzQvYjFzbzNoQ2lMZUlHODFpVmx3PQ==',
    domain: '.login.microsoftonline.com',
    path: '/',
    expires: 1752619633.736638,
    size: 47,
    httpOnly: true,
    secure: true,
    session: false,
    sameSite: 'None',
    priority: 'Medium',
    sameParty: false,
    sourceScheme: 'Secure',
    sourcePort: 443,
    partitionKey: undefined
  },
  {
    name: 'ai_session',
    value: '3jWsXvcGMW+jAXWe3x69i0|1751755598001|1751755630168',
    domain: 'login.microsoftonline.com',
    path: '/',
    expires: 1751757430,
    size: 60,
    httpOnly: false,
    secure: true,
    session: false,
    sameSite: 'None',
    priority: 'Medium',
    sameParty: false,
    sourceScheme: 'Secure',
    sourcePort: 443,
    partitionKey: undefined
  },
  {
    name: 'ai_session',
    value: 'VIcYszlZNXKgKbpvGNuODM|1751755588509|1751755630521',
    domain: 'apps.powerapps.com',
    path: '/',
    expires: 1751757430,
    size: 60,
    httpOnly: false,
    secure: true,
    session: false,
    sameSite: 'None',
    priority: 'Medium',
    sameParty: false,
    sourceScheme: 'Secure',
    sourcePort: 443,
    partitionKey: undefined
  },
  {
    name: 'ESTSAUTHPERSISTENT',
    value: '1.AW8AdTOkPzQ5RUCKqkOq979YbPfhvoluXopNnz3s1gElnadkAQBvAA.AgABFwQAAABVrSpeuWamRam2jAF1XRQEAwDs_wUA9P8pzijdb_kuyybZs30tAWZwobRlhj26XdLutePUqd5_q1nrSxnkiYFYgrw7ymFD7J4QOQRL6C1B23fLVQyQG_LcO5zk5OJf8p11S6vU6AZ8Tnis6xDTeyy_-X8ojdurFDBYv2qrSF-fX7v6P5zMDApK2vtjTtKlLbjociRowlHrrgYqrIcUn0ruk6lKfmN7GX3JstZqELhioZe7S9Dx5TxWhNU_CpPR9p24Pw4BEjAOp4gqsfJ3THz0TuUWpO364XUh8fo5NUaBwzunS--pRqlvV9e1M7HA9PiglNMg1xMtlf5H4I8iklfu-7uyWfML_1L073MOnzQb7b2cnbbGrVPprowfq-btFMp5mNMfM92xiMquikMVtehlL8KYBq1g4LV3XYhLLj5rW2aHy-7NZZw9y0hDaPYarC7ZT89AQR2MDGWdP8vwlYpBKP9OS6x_2fZvVvBu3FWjtPzPUWPvOGD5NwZKzNSkHT0ZZS9nV2xBh8DfPWIplw7Exb2lpTstJJrg_a_NwQDs7NVTDA-Gvt4SdzvKVIa4dKKYKDp957ONi8YVB6JlUU1P0Dc894foQG0dFT2_PBk-zvbXvTnh3PUgyWPn9PF_4GJ4SLhJ_Dg_X-7BE-WmqfDKkeGNKipQ87I7RZ-O1JYhm5GA-zx4gJhtphxTTZJzTBe5IK285xwKBKXK0xBtiEYKPiNk9LKMI8IAR7_fnZlYl4mu0vEXg-MEG8lkwxXMT8T4PU069mH11wkPzsrrhLXI1Vv8fpTht3O_N9GOBwsVrzqADFRkc9fRIH2z06o-IvXnh0ZAjH-IyIcZfGd87QHV1NSK',
    domain: '.login.microsoftonline.com',
    path: '/',
    expires: 1759531633.736446,
    size: 943,
    httpOnly: true,
    secure: true,
    session: false,
    sameSite: 'None',
    priority: 'Medium',
    sameParty: false,
    sourceScheme: 'Secure',
    sourcePort: 443,
    partitionKey: undefined
  },
  {
    name: 'ESTSAUTH',
    value: '1.AW8AdTOkPzQ5RUCKqkOq979YbPfhvoluXopNnz3s1gElnadkAQBvAA.AgABFwQAAABVrSpeuWamRam2jAF1XRQEAwDs_wUA9P9WaSt428mMENI_P2poMQ6SoQEXdD-YbnpeGr5GKqn4JlfXEXVaDHEXzoDhcPmt1dVP4Z3w5u1cwrqq',
    domain: '.login.microsoftonline.com',
    path: '/',
    expires: -1,
    size: 185,
    httpOnly: true,
    secure: true,
    session: true,
    sameSite: 'None',
    priority: 'Medium',
    sameParty: false,
    sourceScheme: 'Secure',
    sourcePort: 443,
    partitionKey: undefined
  },
  {
    name: 'buid',
    value: '1.AW8AdTOkPzQ5RUCKqkOq979YbPfhvoluXopNnz3s1gElnadkAQBvAA.AQABGgEAAABVrSpeuWamRam2jAF1XRQE9jUsS5DX2sL5Br-uzy04exBZTLNNveMHvVIAPQDsh_xhEasVVc1EbNpzVwAJ7UhhSgMlFOQhKcYO8SIBPaFi_XMZr46PGN3Y1kViDrLjTump1ps_tejK6mUjGMTDhVo0P3t4XtiexDk0cS15I-AKR49suZIg_ziIRSsHXR8kIeEgAA',
    domain: 'login.microsoftonline.com',
    path: '/',
    expires: 1754347633.736599,
    size: 267,
    httpOnly: true,
    secure: true,
    session: false,
    sameSite: 'None',
    priority: 'Medium',
    sameParty: false,
    sourceScheme: 'Secure',
    sourcePort: 443,
    partitionKey: undefined
  },
  {
    name: 'SignInStateCookie',
    value: 'CAgABFgIAAABVrSpeuWamRam2jAF1XRQEAwDs_wUA9P_GGtt-dZeZjbb9Bmg_ihOCVPY6EVjE4iNJEpHGK-Lb6XNlmRX5fdUcA-Iswoaf9-SbpWaZVt3hSPeC-C8-nnATrLzY9YUPQF0r2hrK5X0donTlDYW7QWIa6wqi05xDEhVCCogsuHxpqKNVHUDYYvv4-KCH3NfNrBO1e-YcYVvosVrSumedvk6nECjb8xfFSf98mno6QmvfEZhIeIjgk8EYa6YAWczE-QnxRI2KA2At8-bnwLrdxtE9iAiP0UrxdVi04n40-pw3JzZyd10AaEVvyqrxbJQZ3elawOMTS41P8h04U5vOT1fM9CWqeTZ6sUBKRfjGw13SWAZ-DXTG5dHtiMhMQt9-rpISH60o4IODHRBiR1igEFMfJrfsSbDOVreW1pqvo4JV-g',
    domain: '.login.microsoftonline.com',
    path: '/',
    expires: -1,
    size: 456,
    httpOnly: true,
    secure: true,
    session: true,
    sameSite: 'None',
    priority: 'Medium',
    sameParty: false,
    sourceScheme: 'Secure',
    sourcePort: 443,
    partitionKey: undefined
  },
  {
    name: 'fpc',
    value: 'Ap-cBTa_iV5Kjx4itTKUp_ZbCclIAQAAAHGi-98OAAAAVgS2BQEAAABsovvfDgAAAElaYZkBAAAAbqL73w4AAAA',
    domain: 'login.microsoftonline.com',
    path: '/',
    expires: 1754347633.736713,
    size: 90,
    httpOnly: true,
    secure: true,
    session: false,
    sameSite: 'None',
    priority: 'Medium',
    sameParty: false,
    sourceScheme: 'Secure',
    sourcePort: 443,
    partitionKey: undefined
  }
]