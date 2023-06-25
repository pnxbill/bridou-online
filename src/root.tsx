import { component$, useStyles$ } from '@builder.io/qwik';
import {
  QwikCityProvider,
  RouterOutlet,
  ServiceWorkerRegister,
} from '@builder.io/qwik-city';
import { RouterHead } from '~/components/router-head/router-head';

import globalStyles from '~/global.css?inline';
import { Context } from '~/context';

export default component$(() => {
  useStyles$(globalStyles);

  return (
    <QwikCityProvider>
      <head>
        <meta charSet="utf-8" />
        <link rel="manifest" href="/manifest.json" />
        {/* <script src="/card-script.js"></script> */}
        <RouterHead />
      </head>
      <body lang="en">
        <Context>
          <RouterOutlet />
        </Context>

        <ServiceWorkerRegister />
      </body>
    </QwikCityProvider>
  );
});
