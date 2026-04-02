export function shouldRunLocalMongoTests() {
  if (process.env.FARM_ORM_SKIP_LOCAL_MONGODB_TESTS === "1") {
    return false;
  }

  return process.env.FARM_ORM_RUN_LOCAL_MONGODB_TESTS === "1";
}
