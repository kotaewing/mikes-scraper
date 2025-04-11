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
        if (!bidButtonHandle.asElement()) return
        await bidButtonHandle.asElement().click();

        const confirmBidSelector = '[data-control-name="Button_ConfirmBid"]';
        await iframe.waitForSelector(confirmBidSelector);
        const confirmBidHandle = await iframe.evaluateHandle(findTextToClick, 'Confirm');
        if (!confirmBidHandle.asElement()) return
        await confirmBidHandle.asElement().click();
        await delay(1000);

      }
    }
    await delay(5000);
    browser.close();
    browser = null;
    if (running) {
      performTask(trainingLocation, lastDate)
    } else {
      return
    }
  } catch (err) {
    log(`Something went wrong`)
    log(err)
    if (running) {
      performTask(trainingLocation, lastDate)
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

var cookies = [
  {
    "name": "MicrosoftApplicationsTelemetryDeviceId",
    "value": "6266cca2-03ac-409e-b4b4-073e66efd3f8",
    "domain": "apps.powerapps.com",
    "path": "/play/e/default-3fa43375-3934-4045-8aaa-43aaf7bf586c/a",
    "expires": 1772991521,
    "size": 74,
    "httpOnly": false,
    "secure": false,
    "session": false,
    "priority": "Medium",
    "sameParty": false,
    "sourceScheme": "Secure",
    "sourcePort": 443
  },
  {
    "name": "MicrosoftApplicationsTelemetryFirstLaunchTime",
    "value": "2025-03-08T16:22:46.581Z",
    "domain": "apps.powerapps.com",
    "path": "/play/e/default-3fa43375-3934-4045-8aaa-43aaf7bf586c/a",
    "expires": 1772991521,
    "size": 69,
    "httpOnly": false,
    "secure": false,
    "session": false,
    "priority": "Medium",
    "sameParty": false,
    "sourceScheme": "Secure",
    "sourcePort": 443
  },
  {
    "name": "PA_GeoRegion_default-3fa43375-3934-4045-8aaa-43aaf7bf586c",
    "value": "unitedstates",
    "domain": "apps.powerapps.com",
    "path": "/play/e/default-3fa43375-3934-4045-8aaa-43aaf7bf586c/",
    "expires": 1744047521,
    "size": 69,
    "httpOnly": false,
    "secure": true,
    "session": false,
    "sameSite": "None",
    "priority": "Medium",
    "sameParty": false,
    "sourceScheme": "Secure",
    "sourcePort": 443
  },
  {
    "name": "PAOrgSettingsV2",
    "value": "%7B%22contentsecuritypolicyoptions%22%3A0%2C%22iscookieexpiryshortened%22%3Afalse%2C%22tenantid%22%3A%223fa43375-3934-4045-8aaa-43aaf7bf586c%22%7D",
    "domain": "apps.powerapps.com",
    "path": "/play/e/default-3fa43375-3934-4045-8aaa-43aaf7bf586c",
    "expires": 1744047521.54631,
    "size": 161,
    "httpOnly": true,
    "secure": true,
    "session": false,
    "sameSite": "None",
    "priority": "Medium",
    "sameParty": false,
    "sourceScheme": "Secure",
    "sourcePort": 443
  },
  {
    "name": "OGPC",
    "value": "19046228-1:",
    "domain": ".google.com",
    "path": "/",
    "expires": 1744042966,
    "size": 15,
    "httpOnly": false,
    "secure": false,
    "session": false,
    "priority": "Medium",
    "sameParty": false,
    "sourceScheme": "Secure",
    "sourcePort": 443
  },
  {
    "name": "AEC",
    "value": "AVcja2dTUVzktWcj42HoKjamTvwimc3uJSpf6MjlokWqPvpxIH8BQSQrAg",
    "domain": ".google.com",
    "path": "/",
    "expires": 1757002965.584515,
    "size": 61,
    "httpOnly": true,
    "secure": true,
    "session": false,
    "sameSite": "Lax",
    "priority": "Medium",
    "sameParty": false,
    "sourceScheme": "Secure",
    "sourcePort": 443
  },
  {
    "name": "OTZ",
    "value": "7985783_84_84_104220_80_446880",
    "domain": "ogs.google.com",
    "path": "/",
    "expires": 1744042966,
    "size": 33,
    "httpOnly": false,
    "secure": true,
    "session": false,
    "priority": "Medium",
    "sameParty": false,
    "sourceScheme": "Secure",
    "sourcePort": 443
  },
  {
    "name": "PACookieRolloutBucket_prod",
    "value": "StrictCSPForCanvas%3A55%26CSPForceReportViolation%3A50%26PCFAuthCAE%3A58%26TeamsSettingsRedirect%3A39%26TrialPageUrlRedirect%3A28%26IsAppFramePreloadKillSwitchEnabled%3A72%26EnableDraftPreview%3A94%26UseRootMainForModelApps%3A33%26HandlebarsPages%3A49%26ShowTrialBanner%3A28%26EnableInlineNsatUI%3A24%26CopilotAdorner%3A83%26CopilotAdornerPowerBI%3A89%26CopilotAdornerSharePointForm%3A90%26CopilotAdornerSharePointWebPart%3A7%26CopilotAdornerTeams%3A84%26CopilotAdornerIFrame%3A85%26CopilotAdornerNl2Query%3A82%26CopilotAdornerNl2QueryOnHover%3A56%26CopilotAdornerNl2QueryForSQL%3A61%26CopilotSidecar%3A85%26CopilotSidecarOCVFeedback%3A27%26CopilotSidecarLandingCard%3A88%26TrustedUCIAppLifecycleV2%3A17%26OnePlayerEnableAuthCAE%3A93%26OnePlayerTeamsEnableAuthCAE%3A58%26CanvasAppHealthPage%3A67%26EnableWebAuthResourceForMonitors%3A25%26EnableDescriptionCallout%3A30%26UsePowerPlatformAPI%3A3%26EnableAbortController%3A27%26EnableXhrReplacement%3A85%26EnableNativePromise%3A69%26CopilotSidecarRecordPicker%3A62%26PreloadRequestsForAppStart%3A40%26DraftCoPilotV2PromptSuggestions%3A53%26DraftCoPilotV2DefaultSkill%3A33%26DraftWithCopilotPromptVersionV2%3A42%26DraftWithCopilotGenerate%3A36%26EnableWebPlayerDraftPreview%3A43%26EnableCatchUpCallout%3A25%26EnableNewPublishedAppEndpoints%3A89%26EnableCopilotUpsell%3A38%26EnableMsalV3OnStandalone%3A95%26EnableMsalV3OnAppHost%3A40%26EnableMsalV3OnTeams%3A34%26EnableMsalV3OnEmbedded%3A19%26AuthFlowModernPackage%3A78%26WebPlayerAuthExpiryBuffer%3A24%26WebPlayerAuthDefaultExpiry%3A26%26AppHostBridgeEnforcement%3A16%26UseV2MonitoringHub%3A11%26Enable1DSTelemetry%3A35",
    "domain": "apps.powerapps.com",
    "path": "/",
    "expires": 1746634966.329478,
    "size": 1641,
    "httpOnly": true,
    "secure": true,
    "session": false,
    "sameSite": "None",
    "priority": "Medium",
    "sameParty": false,
    "sourceScheme": "Secure",
    "sourcePort": 443
  },
  {
    "name": "NID",
    "value": "522=DIfOdcWCpNdzuZdPL0s7QxCSwHpl8xFDkoHrE9qd68BZOi7hj53xZ-RB9xRP1UH4Duv6p6r4uufEfY50TizgG7jWS8L0RZ28WrFYUJ5z-iP43yjQjTf65L01FXeqIfuQkCYdPlu2kXzp9AWu0MpDKoy5uYHn-KOygzjTVynSz3p_AnoRyHzk4swckzE7XYwujQvI3RTo_lAs-KDRHr4mfgkYUhPrPrlkr2MI",
    "domain": ".google.com",
    "path": "/",
    "expires": 1757262166.418627,
    "size": 235,
    "httpOnly": true,
    "secure": true,
    "session": false,
    "sameSite": "None",
    "priority": "Medium",
    "sameParty": false,
    "sourceScheme": "Secure",
    "sourcePort": 443
  },
  {
    "name": "esctx-Z1zXWRkKYl4",
    "value": "AQABCQEAAABVrSpeuWamRam2jAF1XRQEffcpZYKQRVwyfEq-vG51tShO7l3FLUexcT4oN5FBiLfCZteGTyukpNg_a2MFeC01BiauhSYJQ8EDjJB2-pAM7-bL3pVcWQjj53EkrzDMrwKWIY9V50b9-8gSfaZl8ZGbv-U9WTowkQbBRU1ttyoA-SAA",
    "domain": ".login.microsoftonline.com",
    "path": "/",
    "expires": -1,
    "size": 201,
    "httpOnly": true,
    "secure": true,
    "session": true,
    "sameSite": "None",
    "priority": "Medium",
    "sameParty": false,
    "sourceScheme": "Secure",
    "sourcePort": 443
  },
  {
    "name": "x-ms-gateway-slice",
    "value": "estsfd",
    "domain": "login.microsoftonline.com",
    "path": "/",
    "expires": -1,
    "size": 24,
    "httpOnly": true,
    "secure": true,
    "session": true,
    "sameSite": "None",
    "priority": "Medium",
    "sameParty": false,
    "sourceScheme": "Secure",
    "sourcePort": 443
  },
  {
    "name": "stsservicecookie",
    "value": "estsfd",
    "domain": "login.microsoftonline.com",
    "path": "/",
    "expires": -1,
    "size": 22,
    "httpOnly": true,
    "secure": true,
    "session": true,
    "sameSite": "None",
    "priority": "Medium",
    "sameParty": false,
    "sourceScheme": "Secure",
    "sourcePort": 443
  },
  {
    "name": "AADSSO",
    "value": "NA|NoExtension",
    "domain": ".login.microsoftonline.com",
    "path": "/",
    "expires": -1,
    "size": 20,
    "httpOnly": false,
    "secure": true,
    "session": true,
    "sameSite": "None",
    "priority": "Medium",
    "sameParty": false,
    "sourceScheme": "Secure",
    "sourcePort": 443
  },
  {
    "name": "esctx-P9XXNdLJvJo",
    "value": "AQABCQEAAABVrSpeuWamRam2jAF1XRQEtTNU2x_ff7osaacz8GBkoZWPsj2iuc95smecDDCDSrwz55uM841Y7KokEidXt6Ee3b5hcbPB_oww5yN_XvC2eyZ39f378MH_bSuS9VxscBu2VnspPtiGMhizIJ5XVOAsFSpx-Bv6xSWlUtC1H5JvMSAA",
    "domain": ".login.microsoftonline.com",
    "path": "/",
    "expires": -1,
    "size": 201,
    "httpOnly": true,
    "secure": true,
    "session": true,
    "sameSite": "None",
    "priority": "Medium",
    "sameParty": false,
    "sourceScheme": "Secure",
    "sourcePort": 443
  },
  {
    "name": "MicrosoftApplicationsTelemetryDeviceId",
    "value": "93868e99-cdf6-4e9c-a762-f0de31475de4",
    "domain": "login.microsoftonline.com",
    "path": "/",
    "expires": 1772987146.426624,
    "size": 74,
    "httpOnly": false,
    "secure": true,
    "session": false,
    "sameSite": "None",
    "priority": "Medium",
    "sameParty": false,
    "sourceScheme": "Secure",
    "sourcePort": 443
  },
  {
    "name": "brcap",
    "value": "0",
    "domain": ".login.microsoftonline.com",
    "path": "/",
    "expires": 1775143470,
    "size": 6,
    "httpOnly": false,
    "secure": true,
    "session": false,
    "sameSite": "None",
    "priority": "Medium",
    "sameParty": false,
    "sourceScheme": "Secure",
    "sourcePort": 443
  },
  {
    "name": "esctx-nSnSijrJ3wY",
    "value": "AQABCQEAAABVrSpeuWamRam2jAF1XRQE_BJZ5cc5j-evSRQXcrmFwc-0iovlGI6cTHMcbcTncAfmhm1zzrgHKuE86bnpX3sfN2vDskfgXhnLdmSCf3dNd7-Ed7-0L8M4ubbAkltIrVnhPdK1SU1gH-FcZBDVEax77NTA1k2McEmZZoS_tGqUAiAA",
    "domain": ".login.microsoftonline.com",
    "path": "/",
    "expires": -1,
    "size": 201,
    "httpOnly": true,
    "secure": true,
    "session": true,
    "sameSite": "None",
    "priority": "Medium",
    "sameParty": false,
    "sourceScheme": "Secure",
    "sourcePort": 443
  },
  {
    "name": "esctx-rCxxpC3bz58",
    "value": "AQABCQEAAABVrSpeuWamRam2jAF1XRQEmkh7jript-eur6AMmhH2tBR7lVeTUdcGu1G-XqZqil0GesmjADZtkkKNrzBIhgiZmLeHMAwEY_kIYN_RoEg8_aBJM5yOl5Ujay0kzz8pSD8diLQpjoq_nMTmHkRYap1_bxK8L95sl-iC6wOv0lWlwyAA",
    "domain": ".login.microsoftonline.com",
    "path": "/",
    "expires": -1,
    "size": 201,
    "httpOnly": true,
    "secure": true,
    "session": true,
    "sameSite": "None",
    "priority": "Medium",
    "sameParty": false,
    "sourceScheme": "Secure",
    "sourcePort": 443
  },
  {
    "name": "MSFPC",
    "value": "GUID=1761cf5f18a54e7fac3e172e801570dc&HASH=1761&LV=202503&V=4&LU=1741451080216",
    "domain": "login.microsoftonline.com",
    "path": "/",
    "expires": 1772987079.97162,
    "size": 83,
    "httpOnly": false,
    "secure": true,
    "session": false,
    "sameSite": "None",
    "priority": "Medium",
    "sameParty": false,
    "sourceScheme": "Secure",
    "sourcePort": 443
  },
  {
    "name": "BIGipServervswcrp-secpng_pool",
    "value": "!rre4otp8WjbmyGrA2Oheh26wzj0eNJFdgFUynQvHIGg1HgsOQhIoLfGvXr2jjYMU5OniYwpXjJfgYA==",
    "domain": "rso.allegiantair.com",
    "path": "/",
    "expires": -1,
    "size": 110,
    "httpOnly": true,
    "secure": true,
    "session": true,
    "priority": "Medium",
    "sameParty": false,
    "sourceScheme": "Secure",
    "sourcePort": 443
  },
  {
    "name": "_singlepoint_ngx_carma_id",
    "value": "ebb5401c-7241-4905-8b9f-bfd58172a9a8",
    "domain": ".allegiantair.auth.securid.com",
    "path": "/",
    "expires": 1776011093.92979,
    "size": 61,
    "httpOnly": false,
    "secure": true,
    "session": false,
    "sameSite": "None",
    "priority": "Medium",
    "sameParty": false,
    "sourceScheme": "Secure",
    "sourcePort": 443
  },
  {
    "name": "primary_auth_method",
    "value": "NAN",
    "domain": "allegiantair.auth.securid.com",
    "path": "/",
    "expires": -1,
    "size": 22,
    "httpOnly": false,
    "secure": true,
    "session": true,
    "sameSite": "None",
    "priority": "Medium",
    "sameParty": false,
    "sourceScheme": "Secure",
    "sourcePort": 443
  },
  {
    "name": "step_up_auth_method",
    "value": "NAN",
    "domain": "allegiantair.auth.securid.com",
    "path": "/",
    "expires": -1,
    "size": 22,
    "httpOnly": false,
    "secure": true,
    "session": true,
    "sameSite": "None",
    "priority": "Medium",
    "sameParty": false,
    "sourceScheme": "Secure",
    "sourcePort": 443
  },
  {
    "name": "SECURIDSESSION",
    "value": "ZmI5MzllNmYtN2MwMi00NDRjLWFlN2ItODkwYWFiYWJiYjk3",
    "domain": "allegiantair.auth.securid.com",
    "path": "/",
    "expires": -1,
    "size": 62,
    "httpOnly": true,
    "secure": true,
    "session": true,
    "sameSite": "None",
    "priority": "Medium",
    "sameParty": false,
    "sourceScheme": "Secure",
    "sourcePort": 443
  },
  {
    "name": "PF",
    "value": "4DLLLjgJduxb5hxtHBAqa9y32Ol6B8VxkakNgV4YDAu9",
    "domain": "rso.allegiantair.com",
    "path": "/",
    "expires": -1,
    "size": 46,
    "httpOnly": true,
    "secure": true,
    "session": true,
    "sameSite": "None",
    "priority": "Medium",
    "sameParty": false,
    "sourceScheme": "Secure",
    "sourcePort": 443
  },
  {
    "name": "ESTSAUTHLIGHT",
    "value": "+002f0729-b1de-8b4d-992d-327be55b7106",
    "domain": "login.microsoftonline.com",
    "path": "/",
    "expires": -1,
    "size": 50,
    "httpOnly": false,
    "secure": true,
    "session": true,
    "sameSite": "None",
    "priority": "Medium",
    "sameParty": false,
    "sourceScheme": "Secure",
    "sourcePort": 443
  },
  {
    "name": "esctx",
    "value": "PAQABBwEAAABVrSpeuWamRam2jAF1XRQEtFVaN_I3ZaIHwAWZo4jeKo0_o1Aeb0Kt6S7lS1Tlr446XqtAPmb44FrDVxFH773SAJ6BumkUYmIcwkTXaA_bDPUw-fwpZFRFOQneM5vVeQzi7mwX8F3knb_4vwyMJ9Z44nK0DI5_OCI1uIOS5xbt6zRbkJagCVYpanX-woUv8FsgAA",
    "domain": ".login.microsoftonline.com",
    "path": "/",
    "expires": -1,
    "size": 212,
    "httpOnly": true,
    "secure": true,
    "session": true,
    "sameSite": "None",
    "priority": "Medium",
    "sameParty": false,
    "sourceScheme": "Secure",
    "sourcePort": 443
  },
  {
    "name": "esctx-Y7E6jiZmrSw",
    "value": "AQABCQEAAABVrSpeuWamRam2jAF1XRQEO3_pKedpC1cTwm7uib1fajYr0YW7wVcj0aEbHT6AnxeEfL03OwZ_R9LeTaUT3VGkuMUz6qtYWZdMOZLPuvXT2g34S8Sb2af6B6rubMXHFjM5Z7DVyWz97bpTLTIOQiaYmvy6TaoZNXtrpLCIMHhmOiAA",
    "domain": ".login.microsoftonline.com",
    "path": "/",
    "expires": -1,
    "size": 201,
    "httpOnly": true,
    "secure": true,
    "session": true,
    "sameSite": "None",
    "priority": "Medium",
    "sameParty": false,
    "sourceScheme": "Secure",
    "sourcePort": 443
  },
  {
    "name": "CCState",
    "value": "RWhJS0VFK2JtMXpuNkZ0TnJqTXdtVVZYc1I4PQ==",
    "domain": ".login.microsoftonline.com",
    "path": "/",
    "expires": 1742318160.793659,
    "size": 47,
    "httpOnly": true,
    "secure": true,
    "session": false,
    "sameSite": "None",
    "priority": "Medium",
    "sameParty": false,
    "sourceScheme": "Secure",
    "sourcePort": 443
  },
  {
    "name": "MicrosoftApplicationsTelemetryDeviceId",
    "value": "6266cca2-03ac-409e-b4b4-073e66efd3f8",
    "domain": "apps.powerapps.com",
    "path": "/",
    "expires": 1772991521.741559,
    "size": 74,
    "httpOnly": false,
    "secure": true,
    "session": false,
    "sameSite": "None",
    "priority": "Medium",
    "sameParty": false,
    "sourceScheme": "Secure",
    "sourcePort": 443
  },
  {
    "name": "ESTSAUTHPERSISTENT",
    "value": "1.AW8AdTOkPzQ5RUCKqkOq979YbB74Yj4LWVtClTHK1mg2Vs9kAQBvAA.AgABFwQAAABVrSpeuWamRam2jAF1XRQEAwDs_wUA9P_z6PvK94PKmzNSc_a1hpjM09ansPQh5Q2rVCEBh3YlMugreSBRrnTFgYSc1tpWEgb76RnW3JhiH2Pz08xZQDWXSK4k76GVMY_u9VUfJkZqPmBZ2imsmOa5mHvSwtGREo887Gx_xpnD5AXqtA519-2fcxo4ZpduIRj2W2Wk-5VAWDZQV6uyWImtf-C9nxs6ayFXgJO3-2jeRKQYfl5R-6DZ2hcqwgkpO7rKMZMabYTJJfQ3qkbSOWOCfhBVNyfp2utm1mnGdVFeixHGszIvG7gNlVIJDK2c_vl7PVLQ2sxeVPe06Dc9BCTE2wmt70xuHMfTNI8eMO7sTmwZXrcGQQAH1b_Bhwf9uL9bwMn5z8BAyJvNeHwBfzC_DH6KQ6c1yn7UBDe4DG14N0FNm8qs7QCrRWsJhzYoKQ57gNYHURoOPPQNPiPATvPOOhtBhPcVP3u7CKbhtTc995Wsuym5jMd8a1ZRU9-1_6laLmdiw2xOAXPV0EhpRmIVhR2Ii7lNgyjpHD9VxOgDC8gJc44s5RdancP-ENFfMdnFCC0-t_Zso7uB_uKQl7KiRKuQFNeEdOsNeGx7hSvDM3T9elwYZA2MAOHsGchO2AXr4dZBscWRzxB1sDc3S5ogNuLn70ZkdQp8qGEI3dO-E-ScG8AAlm5JM9NbCW_qr9-3YGy6WQtkAixcVI927Qhuy3As6BN9Wwp77G43gJMbS6wmwJKDlo8IzKL-sio6vaxNJygdhYbRcpVB8rN1cDbme8YbHXR2jQLktPEj87wxMheLtO2fxb0It-irpbkMsPdR1mOgymwkyhnbFO8RLdX1OvUWqjt5g-n2_Cu-Dbq2KuYrrSzrBWdE",
    "domain": ".login.microsoftonline.com",
    "path": "/",
    "expires": 1749230160.793328,
    "size": 971,
    "httpOnly": true,
    "secure": true,
    "session": false,
    "sameSite": "None",
    "priority": "Medium",
    "sameParty": false,
    "sourceScheme": "Secure",
    "sourcePort": 443
  },
  {
    "name": "ESTSAUTH",
    "value": "1.AW8AdTOkPzQ5RUCKqkOq979YbB74Yj4LWVtClTHK1mg2Vs9kAQBvAA.AgABFwQAAABVrSpeuWamRam2jAF1XRQEAwDs_wUA9P8RWxWyr3Ba4OWF2c__Jpp4p0fhJztR_JBn4dYqQUuxfmFdDlj1DHX_bfQUAclZQcur0v0wCVZTMA",
    "domain": ".login.microsoftonline.com",
    "path": "/",
    "expires": -1,
    "size": 183,
    "httpOnly": true,
    "secure": true,
    "session": true,
    "sameSite": "None",
    "priority": "Medium",
    "sameParty": false,
    "sourceScheme": "Secure",
    "sourcePort": 443
  },
  {
    "name": "buid",
    "value": "1.AW8AdTOkPzQ5RUCKqkOq979YbB74Yj4LWVtClTHK1mg2Vs9kAQBvAA.AQABGgEAAABVrSpeuWamRam2jAF1XRQEKLFrUldgbJR1Cp2n-EV2leGnue-K4eXqR-fcXnYAfpp4cp_JoHyCR8Q3m9RwptqbXZAmbITFz08QmoEdcxR7O_b6pvtKFqS5DcMuUQx0TC8BAMG98jZEXhpJINFtvZMntSuLxgAoHzA-w8HrN-Msba0exzAAO42tU7rruAungIwgAA",
    "domain": "login.microsoftonline.com",
    "path": "/",
    "expires": 1744046160.793562,
    "size": 267,
    "httpOnly": true,
    "secure": true,
    "session": false,
    "sameSite": "None",
    "priority": "Medium",
    "sameParty": false,
    "sourceScheme": "Secure",
    "sourcePort": 443
  },
  {
    "name": "SignInStateCookie",
    "value": "CAgABFgIAAABVrSpeuWamRam2jAF1XRQEAwDs_wUA9P-8M5Evst-DddL5IL4FFjQX4LHEEB7GRdsDn5cKIHXFZ2DS9WKvHwnPE8AtZhBMgJNaOy_AYIz3VmF1MCoPND8Gxh0G1QrzbKW4urK9ynU_-JIE8aSZmMrdhz1w0rjH3IsCpRbLJM7W61qRTy8bimEM3EzBhl4QffHSPlZJSZAxGnYVrGYZd9YarwmDlcCJlsnFAqt9s6zLzAfskHMn26o1BFVIMq667BMZG4n685XpLhypE-4fDq0DGUniAjRuEuWQAJSqW7mT2pd7eNnqD7iK5_T2OuaNT5H4J7_FtHUsv3WcrrWkBAP-_CxowMq5KmbJyymdbHYKvNq65OWZqqh3S-zFtjWtBsCZxFc2UwSnKu2-Hq6YZ6-jzBxG8gY3b4R7mGNDdA",
    "domain": ".login.microsoftonline.com",
    "path": "/",
    "expires": -1,
    "size": 452,
    "httpOnly": true,
    "secure": true,
    "session": true,
    "sameSite": "None",
    "priority": "Medium",
    "sameParty": false,
    "sourceScheme": "Secure",
    "sourcePort": 443
  },
  {
    "name": "fpc",
    "value": "AmaITfUDaUxOnD7QvobdkDawLoPVAgAAAEZyXt8OAAAA",
    "domain": "login.microsoftonline.com",
    "path": "/",
    "expires": 1744046160.793789,
    "size": 47,
    "httpOnly": true,
    "secure": true,
    "session": false,
    "sameSite": "None",
    "priority": "Medium",
    "sameParty": false,
    "sourceScheme": "Secure",
    "sourcePort": 443
  }
]