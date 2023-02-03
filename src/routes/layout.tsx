import { component$, Slot } from '@builder.io/qwik';
import Header from '../components/header/header';

export default component$(() => {
  return (
    <>
      <main>
        <Header />
        <section>
          <Slot />
        </section>
      </main>
      {/* <footer>
        <a href="https://linkedin.com/in/pnxbill" target="_blank">
          Made with ♡ by pnxbill
        </a>
      </footer> */}
    </>
  );
});
