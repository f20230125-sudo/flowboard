import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import type { FlowDocument } from "@/flow/schema";
import type { FlowRepository, FlowSummary } from "@/storage/repository";

// All data the UI reads through RTK Query. Flows come from the repository
// (the visitor's own browser today); everything else is a plain REST call to
// this app's /api routes. Components do not know or care which is which.

/** What thunks, listeners and queries get handed besides the store itself. */
export type Extra = { repository: FlowRepository };

const repositoryOf = (extra: unknown) => (extra as Extra).repository;
const asMessage = (error: unknown) => (error instanceof Error ? error.message : "Something went wrong.");
const failed = (error: unknown) => ({ error: { status: "CUSTOM_ERROR" as const, error: asMessage(error) } });

export const api = createApi({
  reducerPath: "api",
  baseQuery: fetchBaseQuery({ baseUrl: "/api" }),
  tagTypes: ["Flows"],
  endpoints: (build) => ({
    listFlows: build.query<FlowSummary[], void>({
      queryFn: async (_arg, { extra }) => {
        try {
          return { data: await repositoryOf(extra).list() };
        } catch (error) {
          return failed(error);
        }
      },
      providesTags: ["Flows"],
    }),
    saveFlow: build.mutation<null, FlowDocument>({
      queryFn: async (flow, { extra }) => {
        try {
          await repositoryOf(extra).save(flow);
          return { data: null };
        } catch (error) {
          return failed(error);
        }
      },
      invalidatesTags: ["Flows"],
    }),
    deleteFlow: build.mutation<null, string>({
      queryFn: async (id, { extra }) => {
        try {
          await repositoryOf(extra).remove(id);
          return { data: null };
        } catch (error) {
          return failed(error);
        }
      },
      invalidatesTags: ["Flows"],
    }),
  }),
});

export const { useListFlowsQuery, useSaveFlowMutation, useDeleteFlowMutation } = api;
